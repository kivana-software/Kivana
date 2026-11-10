use tauri::Manager;
use tauri::Emitter;
use tauri::Listener;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri_plugin_autostart::MacosLauncher;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use serde::Deserialize;
use serde_json::Value;
use base64::Engine;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(target_os = "macos")]
mod macos;

#[derive(Clone)]
struct AutomationPending {
  by_id: Arc<Mutex<HashMap<String, Sender<AutomationResultMsg>>>>,
}

impl AutomationPending {
  fn new() -> Self {
    Self { by_id: Arc::new(Mutex::new(HashMap::new())) }
  }
}

#[derive(Deserialize)]
struct AutomationResultMsg {
  id: String,
  status: String,
  result: Option<Value>,
  error: Option<String>,
}

fn start_automation_http(app: &tauri::AppHandle, pending: AutomationPending) {
  let app = app.clone();
  let pending = pending.clone();
  std::thread::spawn(move || {
    let listener = TcpListener::bind("127.0.0.1:38999");
    let Ok(listener) = listener else { return };
    for stream in listener.incoming() {
      let Ok(stream) = stream else { continue };
      let app = app.clone();
      let pending = pending.clone();
      std::thread::spawn(move || {
        let _ = handle_automation_conn(stream, &app, &pending);
      });
    }
  });
}

fn http_write(mut stream: TcpStream, status: &str, body: &str, content_type: &str) -> std::io::Result<()> {
  let bytes = body.as_bytes();
  let resp = format!(
    "HTTP/1.1 {status}\r\nContent-Type: {ct}\r\nContent-Length: {len}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n",
    status = status,
    ct = content_type,
    len = bytes.len()
  );
  stream.write_all(resp.as_bytes())?;
  stream.write_all(bytes)?;
  Ok(())
}

fn read_http_request(stream: &mut TcpStream) -> std::io::Result<(String, String, usize, Vec<u8>)> {
  let mut buf = Vec::new();
  let mut tmp = [0u8; 4096];
  let mut header_end: Option<usize> = None;
  loop {
    let n = stream.read(&mut tmp)?;
    if n == 0 { break }
    buf.extend_from_slice(&tmp[..n]);
    if header_end.is_none() {
      if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
        header_end = Some(i + 4);
        break;
      }
    }
    if buf.len() > 1024 * 1024 { break }
  }
  let header_end = header_end.unwrap_or(buf.len());
  let header_text = String::from_utf8_lossy(&buf[..header_end]).to_string();
  let mut lines = header_text.split("\r\n");
  let request_line = lines.next().unwrap_or("");
  let mut parts = request_line.split_whitespace();
  let method = parts.next().unwrap_or("").to_string();
  let path = parts.next().unwrap_or("").to_string();
  let mut content_len: usize = 0;
  for line in lines {
    let lower = line.to_lowercase();
    if lower.starts_with("content-length:") {
      let v = lower.split(':').nth(1).unwrap_or("").trim();
      content_len = v.parse::<usize>().unwrap_or(0);
    }
  }
  let mut body = Vec::new();
  let already = buf.len().saturating_sub(header_end);
  if already > 0 {
    body.extend_from_slice(&buf[header_end..]);
  }
  while body.len() < content_len {
    let n = stream.read(&mut tmp)?;
    if n == 0 { break }
    body.extend_from_slice(&tmp[..n]);
    if body.len() > 2 * 1024 * 1024 { break }
  }
  Ok((method, path, content_len, body))
}

fn handle_automation_conn(stream: TcpStream, app: &tauri::AppHandle, pending: &AutomationPending) -> std::io::Result<()> {
  let mut stream = stream;
  stream.set_read_timeout(Some(Duration::from_secs(3)))?;
  let (method, path, _len, body) = read_http_request(&mut stream)?;
  if method == "OPTIONS" {
    return http_write(stream, "204 No Content", "", "text/plain");
  }
  if method == "GET" && path == "/health" {
    return http_write(stream, "200 OK", r#"{"status":"ok"}"#, "application/json");
  }
  if method == "GET" && path == "/commands" {
    let body = r#"{"status":"ok","commands":[
{"name":"get_capabilities","args":{}},
{"name":"set_section","args":{"section":"dashboard|calendar|bills|income|transactions|reports|settings|..."}},
{"name":"dispatch_action","args":{"action":{"type":"..."},"dangerousConfirm":false}},
{"name":"add_transaction","args":{"kind":"expense|income|transfer","amount":0,"currencyCode":"GBP","date":"YYYY-MM-DD","category":"housing|utilities|subscriptions|insurance|taxes|transport|other","customCategoryName":"","payee":"","notes":"","accountId":"","toAccountId":"","tags":[]}},
{"name":"add_bill","args":{"name":"","amount":0,"currencyCode":"GBP","category":"housing|utilities|subscriptions|insurance|taxes|transport|other","customCategoryName":"","recurrence":"once|weekly|monthly|yearly","nextDueDate":"YYYY-MM-DD","notes":""}},
{"name":"add_income","args":{"name":"","amount":0,"currencyCode":"GBP","source":"salary|freelance|rental|investment|other","customSourceName":"","recurrence":"once|weekly|monthly|yearly","nextPayDate":"YYYY-MM-DD","notes":""}},
{"name":"add_reminder","args":{"title":"","when":"YYYY-MM-DDTHH:mm","allDay":false,"recurrence":"once|weekly|monthly|yearly","priority":"low|medium|high|critical","notes":"","remindMinutesBefore":null}},
{"name":"list_transactions","args":{"limit":20,"kind":"expense|income|transfer","dateFrom":"YYYY-MM-DD","dateTo":"YYYY-MM-DD","search":"","category":"housing|utilities|subscriptions|insurance|taxes|transport|other|custom"}},
{"name":"get_month_summary","args":{"month":"YYYY-MM"}},
{"name":"get_year_summary","args":{"year":2026,"startMonth":0,"endMonth":11}},
{"name":"list_bills","args":{"limit":50,"search":""}},
{"name":"list_incomes","args":{"limit":50,"search":""}},
{"name":"list_accounts","args":{}},
{"name":"update_settings","args":{"patch":{}}},
{"name":"add_import_category_rule","args":{"match":"","field":"payee|notes|any","appliesTo":"expense|income|transfer|any","category":"housing|utilities|subscriptions|insurance|taxes|transport|other","customCategoryName":""}},
{"name":"backup_now","args":{}}
]}"#;
    return http_write(stream, "200 OK", body, "application/json");
  }
  if method == "POST" && path == "/run" {
    let parsed = serde_json::from_slice::<Value>(&body).ok().unwrap_or(Value::Null);
    let name = parsed.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string();
    if name.is_empty() {
      return http_write(stream, "400 Bad Request", r#"{"status":"error","error":"missing name"}"#, "application/json");
    }
    let args = parsed.get("args").cloned().unwrap_or(Value::Object(serde_json::Map::new()));
    let id = parsed
      .get("id")
      .and_then(|x| x.as_str())
      .map(|s| s.to_string())
      .unwrap_or_else(|| {
        let ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or(Duration::from_millis(0)).as_millis();
        format!("auto-{ms}")
      });

    let (tx, rx) = std::sync::mpsc::channel::<AutomationResultMsg>();
    {
      let mut map = pending.by_id.lock().unwrap();
      if map.contains_key(&id) {
        return http_write(stream, "409 Conflict", r#"{"status":"error","error":"duplicate id"}"#, "application/json");
      }
      map.insert(id.clone(), tx);
    }

    let payload = serde_json::json!({ "id": id, "name": name, "args": args });
    let emitted = app.emit("automation:run", payload.clone());
    if emitted.is_err() {
      let mut map = pending.by_id.lock().unwrap();
      map.remove(&id);
      return http_write(stream, "500 Internal Server Error", r#"{"status":"error","error":"emit_failed"}"#, "application/json");
    }

    let res = match rx.recv_timeout(Duration::from_secs(8)) {
      Ok(v) => v,
      Err(_) => {
        let mut map = pending.by_id.lock().unwrap();
        map.remove(&id);
        return http_write(
          stream,
          "504 Gateway Timeout",
          r#"{"status":"error","error":"timeout"}"#,
          "application/json",
        );
      }
    };
    let out = serde_json::json!({ "status": res.status, "id": res.id, "result": res.result, "error": res.error });
    return http_write(stream, "200 OK", &out.to_string(), "application/json");
  }
  http_write(stream, "404 Not Found", r#"{"status":"error","error":"not_found"}"#, "application/json")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(AutomationPending::new())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
    .plugin(tauri_plugin_updater::Builder::new().build())
    .menu(|app| build_menu(app))
    .setup(|app| {
      let _ = build_tray(app.handle());
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      let pending = app.state::<AutomationPending>().inner().clone();
      if let Some(w) = app.get_webview_window("main") {
        let pending_for_listener = pending.clone();
        w.listen("automation:result", move |event: tauri::Event| {
          let payload = event.payload();
          if payload.is_empty() { return }
          let parsed = serde_json::from_str::<AutomationResultMsg>(payload);
          let Ok(msg) = parsed else { return };
          let tx = {
            let mut map = pending_for_listener.by_id.lock().unwrap();
            map.remove(&msg.id)
          };
          if let Some(tx) = tx {
            let _ = tx.send(msg);
          }
        });
      }
      start_automation_http(app.handle(), pending);
      #[cfg(target_os = "macos")]
      {
        let _ = macos::touchbar::install(app.handle());
      }
      Ok(())
    })
    .on_menu_event(|app, event| {
      match event.id().0.as_str() {
        "file.export_backup" => {
          let _ = app.emit("menu:export_backup", ());
        }
        "file.import_backup_folder" => {
          let _ = app.emit("menu:import_backup_folder", ());
        }
        "file.import_backup_json" => {
          let _ = app.emit("menu:import_backup_json", ());
        }
        "app.open_settings" => {
          let _ = app.emit("menu:open_settings", ());
        }
        _ => {}
      }
    })
    .invoke_handler(tauri::generate_handler![
      app_data_dir,
      read_data_file,
      write_data_file,
      preserve_corrupt_file,
      migrate_legacy_appsupport_data,
      read_attachment_file,
      attachments_root_dir,
      save_bill_attachment,
      save_invoice_attachment,
      delete_bill_attachment,
      delete_all_attachments,
      reset_all_data,
      export_backup,
      export_csv,
      export_pdf,
      export_calendar_ics,
      read_backup_source,
      restore_attachments_from,
      create_auto_backup,
      list_auto_backups,
      delete_auto_backup
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[derive(serde::Serialize)]
struct ReadAttachmentResult {
  base64: String,
  mime: String,
}

#[tauri::command]
fn read_attachment_file(app: tauri::AppHandle, stored_relative_path: String) -> Result<ReadAttachmentResult, String> {
  if stored_relative_path.contains("..") {
    return Err("invalid stored_relative_path".to_string());
  }
  let root = attachments_root(&app)?;
  let path = root.join(&stored_relative_path);
  if !path.exists() {
    return Err("file not found".to_string());
  }
  let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
  let ext = path
    .extension()
    .and_then(|s| s.to_str())
    .unwrap_or("")
    .to_lowercase();
  let mime = match ext.as_str() {
    "png" => "image/png",
    "jpg" | "jpeg" => "image/jpeg",
    "webp" => "image/webp",
    "gif" => "image/gif",
    "heic" => "image/heic",
    "heif" => "image/heif",
    "pdf" => "application/pdf",
    _ => "application/octet-stream",
  }
  .to_string();
  let base64 = base64::engine::general_purpose::STANDARD.encode(bytes);
  Ok(ReadAttachmentResult { base64, mime })
}

#[tauri::command]
fn migrate_legacy_appsupport_data(app: tauri::AppHandle) -> Result<String, String> {
  let home = app.path().home_dir().map_err(|e| e.to_string())?;
  let legacy_root = home
    .join("Library")
    .join("Application Support")
    .join("Kivana");
  if !legacy_root.exists() {
    return Ok("No legacy data found.".to_string());
  }

  let new_root = data_root(&app)?;
  std::fs::create_dir_all(&new_root).map_err(|e| e.to_string())?;

  let settings_path = new_root.join("settings.json");
  let mut people_enabled = false;
  let mut active_person_id = "person-1".to_string();
  if settings_path.exists() {
    if let Ok(raw) = std::fs::read_to_string(&settings_path) {
      if let Ok(v) = serde_json::from_str::<Value>(&raw) {
        people_enabled = v.get("peopleEnabled").and_then(|x| x.as_bool()).unwrap_or(false);
        active_person_id = v
          .get("activePersonId")
          .and_then(|x| x.as_str())
          .unwrap_or("person-1")
          .to_string();
      }
    }
  }

  let files = vec![
    "bills.json",
    "incomes.json",
    "accounts.json",
    "transactions.json",
    "reminders.json",
    "invoices.json",
    "goals.json",
    "debts.json",
  ];
  let mut migrated: Vec<String> = Vec::new();

  fn json_is_effectively_empty(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() || t == "[]" || t == "{}" {
      return true;
    }
    let v = serde_json::from_str::<Value>(t);
    if v.is_err() {
      return false;
    }
    let v = v.unwrap();
    if let Some(arr) = v.as_array() {
      return arr.is_empty();
    }
    if let Some(obj) = v.as_object() {
      if obj.is_empty() {
        return true;
      }
      if let Some(by_person) = obj.get("byPerson").and_then(|x| x.as_object()) {
        for (_, vv) in by_person {
          if let Some(a) = vv.as_array() {
            if !a.is_empty() {
              return false;
            }
          }
        }
        return true;
      }
    }
    false
  }

  for name in files {
    let src = legacy_root.join(name);
    if !src.exists() {
      continue;
    }
    let dst = new_root.join(name);
    if dst.exists() {
      if let Ok(dst_text) = std::fs::read_to_string(&dst) {
        if !json_is_effectively_empty(&dst_text) {
          continue;
        }
      }
    }
    let src_text = std::fs::read_to_string(&src).map_err(|e| e.to_string())?;
    if src_text.trim().len() <= 10 {
      continue;
    }

    let out = if name == "transactions.json" && people_enabled {
      if let Ok(arr) = serde_json::from_str::<Value>(&src_text) {
        if arr.is_array() {
          serde_json::json!({ "version": 2, "byPerson": { active_person_id.clone(): arr } }).to_string()
        } else {
          src_text.clone()
        }
      } else {
        src_text.clone()
      }
    } else {
      src_text.clone()
    };

    std::fs::write(&dst, out.as_bytes()).map_err(|e| e.to_string())?;
    migrated.push(name.to_string());
  }

  if migrated.is_empty() {
    return Ok("Legacy data found, but nothing needed migration.".to_string());
  }
  Ok(format!("Migrated: {}", migrated.join(", ")))
}

fn build_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
  let export = MenuItem::with_id(app, "file.export_backup", "Export Backup…", true, Some("CmdOrCtrl+E"))?;
  let import_folder = MenuItem::with_id(app, "file.import_backup_folder", "Import Backup Folder…", true, Some("CmdOrCtrl+I"))?;
  let import_json = MenuItem::with_id(app, "file.import_backup_json", "Import Backup JSON…", true, None::<&str>)?;
  let settings = MenuItem::with_id(app, "app.open_settings", "Settings…", true, Some("CmdOrCtrl+,"))?;

  let file = Submenu::new(app, "File", true)?;
  file.append(&export)?;
  file.append(&import_folder)?;
  file.append(&import_json)?;
  file.append(&PredefinedMenuItem::separator(app)?)?;
  file.append(&PredefinedMenuItem::quit(app, Some("Quit"))?)?;

  let edit = Submenu::new(app, "Edit", true)?;
  edit.append(&PredefinedMenuItem::undo(app, None)?)?;
  edit.append(&PredefinedMenuItem::redo(app, None)?)?;
  edit.append(&PredefinedMenuItem::separator(app)?)?;
  edit.append(&PredefinedMenuItem::cut(app, None)?)?;
  edit.append(&PredefinedMenuItem::copy(app, None)?)?;
  edit.append(&PredefinedMenuItem::paste(app, None)?)?;
  edit.append(&PredefinedMenuItem::select_all(app, None)?)?;

  let app_menu = Submenu::new(app, "App", true)?;
  app_menu.append(&settings)?;

  let menu = Menu::new(app)?;
  menu.append(&app_menu)?;
  menu.append(&file)?;
  menu.append(&edit)?;
  Ok(menu)
}

fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
  let show = MenuItem::with_id(app, "tray.show", "Show", true, None::<&str>)?;
  let hide = MenuItem::with_id(app, "tray.hide", "Hide", true, None::<&str>)?;
  let export = MenuItem::with_id(app, "tray.export_backup", "Export Backup…", true, None::<&str>)?;
  let settings = MenuItem::with_id(app, "tray.open_settings", "Settings…", true, None::<&str>)?;
  let quit = MenuItem::with_id(app, "tray.quit", "Quit", true, None::<&str>)?;

  let menu = Menu::new(app)?;
  menu.append(&show)?;
  menu.append(&hide)?;
  menu.append(&PredefinedMenuItem::separator(app)?)?;
  menu.append(&export)?;
  menu.append(&settings)?;
  menu.append(&PredefinedMenuItem::separator(app)?)?;
  menu.append(&quit)?;

  TrayIconBuilder::new()
    .menu(&menu)
    .on_menu_event(move |app, event| {
      match event.id().0.as_str() {
        "tray.show" => {
          if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
            let _ = w.set_focus();
          }
        }
        "tray.hide" => {
          if let Some(w) = app.get_webview_window("main") {
            let _ = w.hide();
          }
        }
        "tray.export_backup" => {
          let _ = app.emit("menu:export_backup", ());
        }
        "tray.open_settings" => {
          let _ = app.emit("menu:open_settings", ());
        }
        "tray.quit" => {
          app.exit(0);
        }
        _ => {}
      }
    })
    .on_tray_icon_event(move |tray, event| {
      if let TrayIconEvent::Click { button, button_state, .. } = event {
        if button == MouseButton::Left && button_state == MouseButtonState::Up {
          let app = tray.app_handle();
          if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
            let _ = w.set_focus();
          }
        }
      }
    })
    .build(app)?;

  Ok(())
}

fn allowed_data_file(name: &str) -> Option<&'static str> {
  match name {
    "bills.json" => Some("bills.json"),
    "incomes.json" => Some("incomes.json"),
    "accounts.json" => Some("accounts.json"),
    "transactions.json" => Some("transactions.json"),
    "reminders.json" => Some("reminders.json"),
    "invoices.json" => Some("invoices.json"),
    "goals.json" => Some("goals.json"),
    "debts.json" => Some("debts.json"),
    "settings.json" => Some("settings.json"),
    "auth.json" => Some("auth.json"),
    "entitlements.json" => Some("entitlements.json"),
    "command_memory.json" => Some("command_memory.json"),
    _ => None,
  }
}

fn data_root(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
  let base = app
    .path()
    .app_data_dir()
    .map_err(|e| e.to_string())?;
  Ok(base.join("Kivana"))
}

fn attachments_root(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
  let root = data_root(app)?.join("Attachments");
  std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
  Ok(root)
}

#[tauri::command]
fn app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
  let p = data_root(&app)?;
  Ok(p.to_string_lossy().to_string())
}

#[tauri::command]
fn attachments_root_dir(app: tauri::AppHandle) -> Result<String, String> {
  let p = attachments_root(&app)?;
  Ok(p.to_string_lossy().to_string())
}

#[tauri::command]
fn read_data_file(app: tauri::AppHandle, name: String) -> Result<Option<String>, String> {
  let file = allowed_data_file(&name).ok_or_else(|| "unsupported file".to_string())?;
  let root = data_root(&app)?;
  let path = root.join(file);
  if !path.exists() {
    return Ok(None);
  }
  let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
  let text = String::from_utf8(bytes).map_err(|e| e.to_string())?;
  Ok(Some(text))
}

#[tauri::command]
fn write_data_file(app: tauri::AppHandle, name: String, content: String) -> Result<(), String> {
  let file = allowed_data_file(&name).ok_or_else(|| "unsupported file".to_string())?;
  let root = data_root(&app)?;
  std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
  let path = root.join(file);
  let tmp_name = format!(
    "{}.tmp-{}-{}",
    file,
    std::process::id(),
    std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map_err(|e| e.to_string())?
      .as_millis()
  );
  let tmp_path = root.join(tmp_name);
  std::fs::write(&tmp_path, content.as_bytes()).map_err(|e| e.to_string())?;
  if path.exists() {
    let _ = std::fs::remove_file(&path);
  }
  std::fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
fn preserve_corrupt_file(app: tauri::AppHandle, name: String) -> Result<(), String> {
  let file = allowed_data_file(&name).ok_or_else(|| "unsupported file".to_string())?;
  let root = data_root(&app)?;
  let path = root.join(file);
  if !path.exists() {
    return Ok(());
  }
  std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
  let stamp = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map_err(|e| e.to_string())?
    .as_secs();
  let backup = format!("{}.corrupt-{}.json", file.trim_end_matches(".json"), stamp);
  let backup_path = root.join(backup);
  let _ = std::fs::copy(&path, &backup_path);
  Ok(())
}

fn is_absolute_path(path: &str) -> bool {
  std::path::Path::new(path).is_absolute()
}

fn copy_dir_recursive(source: &std::path::Path, dest: &std::path::Path) -> Result<(), String> {
  if !source.exists() {
    return Ok(());
  }
  std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
  for entry in std::fs::read_dir(source).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let src = entry.path();
    let file_name = entry.file_name();
    let dst = dest.join(file_name);
    let file_type = entry.file_type().map_err(|e| e.to_string())?;
    if file_type.is_dir() {
      copy_dir_recursive(&src, &dst)?;
    } else if file_type.is_file() {
      if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
      }
      if dst.exists() {
        let _ = std::fs::remove_file(&dst);
      }
      std::fs::copy(&src, &dst).map_err(|e| e.to_string())?;
    }
  }
  Ok(())
}

#[derive(serde::Serialize)]
struct SavedAttachment {
  stored_relative_path: String,
  display_name: String,
}

#[tauri::command]
fn save_bill_attachment(
  app: tauri::AppHandle,
  bill_id: String,
  attachment_id: String,
  source_path: String,
  display_name: Option<String>,
) -> Result<SavedAttachment, String> {
  if bill_id.trim().is_empty() {
    return Err("bill_id required".to_string());
  }
  if attachment_id.trim().is_empty() {
    return Err("attachment_id required".to_string());
  }
  if !is_absolute_path(&source_path) {
    return Err("source_path must be absolute".to_string());
  }

  let src = std::path::PathBuf::from(&source_path);
  if !src.exists() {
    return Err("source file does not exist".to_string());
  }
  let ext = src
    .extension()
    .and_then(|s| s.to_str())
    .filter(|s| !s.trim().is_empty())
    .unwrap_or("dat");
  let stored_file_name = format!("{}.{}", attachment_id, ext);

  let root = attachments_root(&app)?;
  let bill_dir = root.join(&bill_id);
  std::fs::create_dir_all(&bill_dir).map_err(|e| e.to_string())?;
  let dest = bill_dir.join(&stored_file_name);

  if dest.exists() {
    let _ = std::fs::remove_file(&dest);
  }
  std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;

  let relative = format!("{}/{}", bill_id, stored_file_name);
  let fallback_name = src
    .file_name()
    .and_then(|s| s.to_str())
    .filter(|s| !s.trim().is_empty())
    .unwrap_or(&stored_file_name)
    .to_string();
  let dn = display_name
    .unwrap_or(fallback_name)
    .trim()
    .to_string();

  Ok(SavedAttachment {
    stored_relative_path: relative,
    display_name: dn,
  })
}

#[tauri::command]
fn save_invoice_attachment(
  app: tauri::AppHandle,
  invoice_id: String,
  attachment_id: String,
  source_path: String,
  display_name: Option<String>,
) -> Result<SavedAttachment, String> {
  if invoice_id.trim().is_empty() {
    return Err("invoice_id required".to_string());
  }
  if attachment_id.trim().is_empty() {
    return Err("attachment_id required".to_string());
  }
  if !is_absolute_path(&source_path) {
    return Err("source_path must be absolute".to_string());
  }

  let src = std::path::PathBuf::from(&source_path);
  if !src.exists() {
    return Err("source file does not exist".to_string());
  }
  let ext = src
    .extension()
    .and_then(|s| s.to_str())
    .filter(|s| !s.trim().is_empty())
    .unwrap_or("dat");
  let stored_file_name = format!("{}.{}", attachment_id, ext);

  let root = attachments_root(&app)?;
  let invoices_dir = root.join("Invoices");
  let invoice_dir = invoices_dir.join(&invoice_id);
  std::fs::create_dir_all(&invoice_dir).map_err(|e| e.to_string())?;
  let dest = invoice_dir.join(&stored_file_name);

  if dest.exists() {
    let _ = std::fs::remove_file(&dest);
  }
  std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;

  let relative = format!("Invoices/{}/{}", invoice_id, stored_file_name);
  let fallback_name = src
    .file_name()
    .and_then(|s| s.to_str())
    .filter(|s| !s.trim().is_empty())
    .unwrap_or(&stored_file_name)
    .to_string();
  let dn = display_name
    .unwrap_or(fallback_name)
    .trim()
    .to_string();

  Ok(SavedAttachment {
    stored_relative_path: relative,
    display_name: dn,
  })
}

#[tauri::command]
fn delete_bill_attachment(app: tauri::AppHandle, stored_relative_path: String) -> Result<(), String> {
  if stored_relative_path.contains("..") {
    return Err("invalid stored_relative_path".to_string());
  }
  let root = attachments_root(&app)?;
  let path = root.join(stored_relative_path);
  if path.exists() {
    std::fs::remove_file(&path).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn delete_all_attachments(app: tauri::AppHandle) -> Result<(), String> {
  let root = attachments_root(&app)?;
  if root.exists() {
    std::fs::remove_dir_all(&root).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn reset_all_data(app: tauri::AppHandle) -> Result<(), String> {
  let root = data_root(&app)?;
  if root.exists() {
    std::fs::remove_dir_all(&root).map_err(|e| e.to_string())?;
  }
  std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
  if let Ok(home) = app.path().home_dir() {
    let legacy_root = home
      .join("Library")
      .join("Application Support")
      .join("Kivana");
    if legacy_root.exists() {
      let _ = std::fs::remove_dir_all(&legacy_root);
    }
  }
  Ok(())
}

#[tauri::command]
fn export_backup(
  app: tauri::AppHandle,
  bundle_dir_path: String,
  backup_json: String,
  attachment_paths: Vec<String>,
) -> Result<(), String> {
  if !is_absolute_path(&bundle_dir_path) {
    return Err("bundle_dir_path must be absolute".to_string());
  }
  if !bundle_dir_path.to_lowercase().ends_with(".pfbackup") {
    return Err("bundle_dir_path must end with .pfbackup".to_string());
  }
  let bundle_dir = std::path::PathBuf::from(&bundle_dir_path);
  if bundle_dir.exists() {
    std::fs::remove_dir_all(&bundle_dir).map_err(|e| e.to_string())?;
  }
  std::fs::create_dir_all(&bundle_dir).map_err(|e| e.to_string())?;

  let json_path = bundle_dir.join("backup.json");
  std::fs::write(&json_path, backup_json.as_bytes()).map_err(|e| e.to_string())?;

  let bundle_attachments_root = bundle_dir.join("Attachments");
  std::fs::create_dir_all(&bundle_attachments_root).map_err(|e| e.to_string())?;

  let app_attachments_root = attachments_root(&app)?;
  let mut unique: std::collections::HashSet<String> = std::collections::HashSet::new();
  for p in attachment_paths {
    if p.contains("..") {
      continue;
    }
    unique.insert(p);
  }
  for rel in unique {
    let src = app_attachments_root.join(&rel);
    if !src.exists() {
      continue;
    }
    let dest = bundle_attachments_root.join(&rel);
    if let Some(parent) = dest.parent() {
      std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if dest.exists() {
      let _ = std::fs::remove_file(&dest);
    }
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
  }

  Ok(())
}

#[derive(serde::Serialize)]
struct AutoBackupInfo {
  path: String,
  name: String,
  #[serde(rename = "modifiedAtMs")]
  modified_at_ms: u64,
}

fn auto_backups_root(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
  let root = data_root(app)?.join("AutoBackups");
  std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
  Ok(root)
}

fn millis_since_epoch(t: std::time::SystemTime) -> u64 {
  t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[tauri::command]
fn list_auto_backups(app: tauri::AppHandle) -> Result<Vec<AutoBackupInfo>, String> {
  let root = auto_backups_root(&app)?;
  if !root.exists() {
    return Ok(vec![]);
  }
  let mut out: Vec<AutoBackupInfo> = Vec::new();
  for entry in std::fs::read_dir(&root).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let p = entry.path();
    let name = entry.file_name().to_string_lossy().to_string();
    if !name.to_lowercase().ends_with(".pfbackup") {
      continue;
    }
    if !p.is_dir() {
      continue;
    }
    let meta = entry.metadata().map_err(|e| e.to_string())?;
    let m = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
    out.push(AutoBackupInfo {
      path: p.to_string_lossy().to_string(),
      name,
      modified_at_ms: millis_since_epoch(m),
    });
  }
  out.sort_by(|a, b| b.modified_at_ms.cmp(&a.modified_at_ms));
  Ok(out)
}

fn export_backup_to_dir(
  app: &tauri::AppHandle,
  bundle_dir: &std::path::PathBuf,
  backup_json: &str,
  attachment_paths: &Vec<String>,
) -> Result<(), String> {
  if bundle_dir.exists() {
    std::fs::remove_dir_all(bundle_dir).map_err(|e| e.to_string())?;
  }
  std::fs::create_dir_all(bundle_dir).map_err(|e| e.to_string())?;

  let json_path = bundle_dir.join("backup.json");
  std::fs::write(&json_path, backup_json.as_bytes()).map_err(|e| e.to_string())?;

  let bundle_attachments_root = bundle_dir.join("Attachments");
  std::fs::create_dir_all(&bundle_attachments_root).map_err(|e| e.to_string())?;

  let app_attachments_root = attachments_root(app)?;
  let mut unique: std::collections::HashSet<String> = std::collections::HashSet::new();
  for p in attachment_paths {
    if p.contains("..") {
      continue;
    }
    unique.insert(p.clone());
  }
  for rel in unique {
    let src = app_attachments_root.join(&rel);
    if !src.exists() {
      continue;
    }
    let dest = bundle_attachments_root.join(&rel);
    if let Some(parent) = dest.parent() {
      std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if dest.exists() {
      let _ = std::fs::remove_file(&dest);
    }
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[derive(serde::Serialize)]
struct CreatedAutoBackup {
  path: String,
}

#[tauri::command]
fn create_auto_backup(
  app: tauri::AppHandle,
  backup_json: String,
  attachment_paths: Vec<String>,
  keep_count: u32,
) -> Result<CreatedAutoBackup, String> {
  let keep = keep_count.clamp(1, 20) as usize;
  let root = auto_backups_root(&app)?;

  let now = std::time::SystemTime::now();
  let stamp = millis_since_epoch(now);
  let dir_name = format!("AutoBackup_{}.pfbackup", stamp);
  let bundle_dir = root.join(dir_name);

  export_backup_to_dir(&app, &bundle_dir, &backup_json, &attachment_paths)?;

  let mut items: Vec<(u64, std::path::PathBuf)> = Vec::new();
  for entry in std::fs::read_dir(&root).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let p = entry.path();
    let name = entry.file_name().to_string_lossy().to_string();
    if !name.to_lowercase().ends_with(".pfbackup") || !p.is_dir() {
      continue;
    }
    let meta = entry.metadata().map_err(|e| e.to_string())?;
    let m = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
    items.push((millis_since_epoch(m), p));
  }
  items.sort_by(|a, b| b.0.cmp(&a.0));
  for (_, p) in items.into_iter().skip(keep) {
    let _ = std::fs::remove_dir_all(&p);
  }

  Ok(CreatedAutoBackup {
    path: bundle_dir.to_string_lossy().to_string(),
  })
}

#[tauri::command]
fn delete_auto_backup(app: tauri::AppHandle, path: String) -> Result<(), String> {
  if !is_absolute_path(&path) {
    return Err("path must be absolute".to_string());
  }
  let root = auto_backups_root(&app)?;
  let target = std::path::PathBuf::from(&path);
  let root_can = root.canonicalize().map_err(|e| e.to_string())?;
  let target_can = target.canonicalize().map_err(|e| e.to_string())?;
  if !target_can.starts_with(&root_can) {
    return Err("path is outside AutoBackups".to_string());
  }
  if target_can.is_dir() {
    std::fs::remove_dir_all(&target_can).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn export_calendar_ics(destination_path: String, ics_content: String) -> Result<(), String> {
  if !is_absolute_path(&destination_path) {
    return Err("destination_path must be absolute".to_string());
  }
  if !destination_path.to_lowercase().ends_with(".ics") {
    return Err("destination_path must end with .ics".to_string());
  }
  let p = std::path::PathBuf::from(destination_path);
  std::fs::write(&p, ics_content.as_bytes()).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
fn export_csv(destination_path: String, csv_content: String) -> Result<(), String> {
  if !is_absolute_path(&destination_path) {
    return Err("destination_path must be absolute".to_string());
  }
  if !destination_path.to_lowercase().ends_with(".csv") {
    return Err("destination_path must end with .csv".to_string());
  }
  let dest = std::path::PathBuf::from(&destination_path);
  let parent = dest
    .parent()
    .ok_or_else(|| "destination_path must have a parent directory".to_string())?;
  std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;

  let file_name = dest
    .file_name()
    .ok_or_else(|| "destination_path must have a file name".to_string())?
    .to_string_lossy()
    .to_string();
  let tmp_name = format!(
    "{}.tmp-{}-{}",
    file_name,
    std::process::id(),
    std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map_err(|e| e.to_string())?
      .as_millis()
  );
  let tmp_path = parent.join(tmp_name);
  std::fs::write(&tmp_path, csv_content.as_bytes()).map_err(|e| e.to_string())?;
  if dest.exists() {
    let _ = std::fs::remove_file(&dest);
  }
  std::fs::rename(&tmp_path, &dest).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
fn export_pdf(destination_path: String, pdf_content: Vec<u8>) -> Result<(), String> {
  if !is_absolute_path(&destination_path) {
    return Err("destination_path must be absolute".to_string());
  }
  if !destination_path.to_lowercase().ends_with(".pdf") {
    return Err("destination_path must end with .pdf".to_string());
  }
  let dest = std::path::PathBuf::from(&destination_path);
  let parent = dest
    .parent()
    .ok_or_else(|| "destination_path must have a parent directory".to_string())?;
  std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;

  let file_name = dest
    .file_name()
    .ok_or_else(|| "destination_path must have a file name".to_string())?
    .to_string_lossy()
    .to_string();
  let tmp_name = format!(
    "{}.tmp-{}-{}",
    file_name,
    std::process::id(),
    std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map_err(|e| e.to_string())?
      .as_millis()
  );
  let tmp_path = parent.join(tmp_name);
  std::fs::write(&tmp_path, &pdf_content).map_err(|e| e.to_string())?;
  if dest.exists() {
    let _ = std::fs::remove_file(&dest);
  }
  std::fs::rename(&tmp_path, &dest).map_err(|e| e.to_string())?;
  Ok(())
}

#[derive(serde::Serialize)]
struct BackupSource {
  json: String,
  attachments_source_dir: Option<String>,
}

#[tauri::command]
fn read_backup_source(path: String) -> Result<BackupSource, String> {
  if !is_absolute_path(&path) {
    return Err("path must be absolute".to_string());
  }
  let p = std::path::PathBuf::from(&path);
  let lower = path.to_lowercase();
  if lower.ends_with(".pfbackup") {
    let json_path = p.join("backup.json");
    let bytes = std::fs::read(&json_path).map_err(|e| e.to_string())?;
    let text = String::from_utf8(bytes).map_err(|e| e.to_string())?;
    let attachments = p.join("Attachments");
    let dir = if attachments.exists() {
      Some(attachments.to_string_lossy().to_string())
    } else {
      None
    };
    return Ok(BackupSource {
      json: text,
      attachments_source_dir: dir,
    });
  }
  let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
  let text = String::from_utf8(bytes).map_err(|e| e.to_string())?;
  Ok(BackupSource {
    json: text,
    attachments_source_dir: None,
  })
}

#[tauri::command]
fn restore_attachments_from(app: tauri::AppHandle, source_root_dir: String) -> Result<(), String> {
  if !is_absolute_path(&source_root_dir) {
    return Err("source_root_dir must be absolute".to_string());
  }
  let source = std::path::PathBuf::from(&source_root_dir);
  if !source.exists() {
    return Err("source_root_dir does not exist".to_string());
  }
  let dest_root = attachments_root(&app)?;
  if dest_root.exists() {
    let _ = std::fs::remove_dir_all(&dest_root);
  }
  std::fs::create_dir_all(&dest_root).map_err(|e| e.to_string())?;
  copy_dir_recursive(&source, &dest_root)?;
  Ok(())
}
