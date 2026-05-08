use tauri::Manager;
use tauri::Emitter;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri_plugin_autostart::MacosLauncher;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use serde_json::Value;
use std::process::Command;

#[cfg(target_os = "macos")]
mod macos;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
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
      open_external_url,
      migrate_legacy_appsupport_data,
      export_backup,
      read_backup_source
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
  let u = url.trim().to_string();
  if u.len() > 2048 {
    return Err("url too long".to_string());
  }
  if !(u.starts_with("https://") || u.starts_with("http://")) {
    return Err("unsupported url".to_string());
  }

  #[cfg(target_os = "macos")]
  {
    Command::new("open").arg(&u).spawn().map_err(|e| e.to_string())?;
    return Ok(());
  }
  #[cfg(target_os = "windows")]
  {
    Command::new("cmd")
      .args(["/c", "start", "", &u])
      .spawn()
      .map_err(|e| e.to_string())?;
    return Ok(());
  }
  #[cfg(not(any(target_os = "macos", target_os = "windows")))]
  {
    Command::new("xdg-open").arg(&u).spawn().map_err(|e| e.to_string())?;
    return Ok(());
  }
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

  let files = vec![
    "bills.json",
    "accounts.json",
    "transactions.json",
    "settings.json",
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

    let out = src_text.clone();

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
    "accounts.json" => Some("accounts.json"),
    "transactions.json" => Some("transactions.json"),
    "settings.json" => Some("settings.json"),
    _ => None,
  }
}

fn data_root(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
  let base = app
    .path()
    .app_data_dir()
    .map_err(|e| e.to_string())?;
  Ok(base.join("KivanaBasic"))
}

#[tauri::command]
fn app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
  let p = data_root(&app)?;
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

#[tauri::command]
fn export_backup(
  _app: tauri::AppHandle,
  bundle_dir_path: String,
  backup_json: String,
  _attachment_paths: Vec<String>,
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

  Ok(())
}

#[derive(serde::Serialize)]
struct BackupSource {
  json: String,
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
    return Ok(BackupSource {
      json: text,
    });
  }
  let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
  let text = String::from_utf8(bytes).map_err(|e| e.to_string())?;
  Ok(BackupSource { json: text })
}
