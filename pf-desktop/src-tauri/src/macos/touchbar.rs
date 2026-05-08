use std::sync::OnceLock;

use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, ClassBuilder, NSObject};
use objc2::runtime::Sel;
use objc2::{msg_send, sel, ClassType, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
  NSButton, NSCustomTouchBarItem, NSTouchBar, NSTouchBarItem, NSTouchBarItemIdentifierFixedSpaceSmall,
  NSTouchBarItemIdentifierFlexibleSpace,
};
use objc2_foundation::{ns_string, NSArray, NSSet, NSString};
use tauri::{Emitter, Manager};

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

fn id_parse() -> &'static NSString {
  ns_string!("pf.touchbar.parse")
}
fn id_next() -> &'static NSString {
  ns_string!("pf.touchbar.nextDue")
}
fn id_pay() -> &'static NSString {
  ns_string!("pf.touchbar.pay")
}
fn id_snooze3() -> &'static NSString {
  ns_string!("pf.touchbar.snooze3")
}
fn id_reports() -> &'static NSString {
  ns_string!("pf.touchbar.reports")
}
fn id_settings() -> &'static NSString {
  ns_string!("pf.touchbar.settings")
}

fn target_class() -> &'static AnyClass {
  static REGISTER: std::sync::Once = std::sync::Once::new();
  REGISTER.call_once(|| {
    let superclass = NSObject::class();
    let mut builder = ClassBuilder::new(c"PFTouchBarTarget", superclass).unwrap();

    type ActionFn = extern "C" fn(*mut AnyObject, Sel, *mut AnyObject);

    extern "C" fn on_parse(_: *mut AnyObject, _: Sel, _: *mut AnyObject) {
      if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit("touchbar:parse", ());
      }
    }

    extern "C" fn on_next(_: *mut AnyObject, _: Sel, _: *mut AnyObject) {
      if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit("touchbar:nextDue", ());
      }
    }

    extern "C" fn on_pay(_: *mut AnyObject, _: Sel, _: *mut AnyObject) {
      if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit("touchbar:pay", ());
      }
    }

    extern "C" fn on_snooze3(_: *mut AnyObject, _: Sel, _: *mut AnyObject) {
      if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit("touchbar:snooze3", ());
      }
    }

    extern "C" fn on_reports(_: *mut AnyObject, _: Sel, _: *mut AnyObject) {
      if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit("touchbar:reports", ());
      }
    }

    extern "C" fn on_settings(_: *mut AnyObject, _: Sel, _: *mut AnyObject) {
      if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit("touchbar:settings", ());
      }
    }

    unsafe {
      builder.add_method(sel!(onParse:), on_parse as ActionFn);
      builder.add_method(sel!(onNext:), on_next as ActionFn);
      builder.add_method(sel!(onPay:), on_pay as ActionFn);
      builder.add_method(sel!(onSnooze3:), on_snooze3 as ActionFn);
      builder.add_method(sel!(onReports:), on_reports as ActionFn);
      builder.add_method(sel!(onSettings:), on_settings as ActionFn);
    }

    let _ = builder.register();
  });
  AnyClass::get(c"PFTouchBarTarget").unwrap()
}

fn new_target() -> Retained<AnyObject> {
  unsafe { msg_send![target_class(), new] }
}

unsafe fn make_item(
  mtm: MainThreadMarker,
  identifier: &NSString,
  title: &'static NSString,
  target: &AnyObject,
  action: Sel,
) -> Retained<NSCustomTouchBarItem> {
  let button = NSButton::buttonWithTitle_target_action(title, Some(target), Some(action), mtm);
  let item = NSCustomTouchBarItem::initWithIdentifier(NSCustomTouchBarItem::alloc(mtm), identifier);
  let view = button.as_super().as_super();
  item.setView(view);
  item
}

pub fn install(app: &tauri::AppHandle) -> tauri::Result<()> {
  let _ = APP_HANDLE.set(app.clone());

  let Some(main) = app.get_webview_window("main") else { return Ok(()) };
  let mtm = MainThreadMarker::new().expect("main thread");

  unsafe {
    let ns_window_ptr = main.ns_window()?;
    let ns_window: &AnyObject = &*(ns_window_ptr as *const AnyObject);

    let target = new_target();

    let item_parse = make_item(mtm, id_parse(), ns_string!("Parse"), &*target, sel!(onParse:));
    let item_next = make_item(mtm, id_next(), ns_string!("Next Bill"), &*target, sel!(onNext:));
    let item_pay = make_item(mtm, id_pay(), ns_string!("Pay"), &*target, sel!(onPay:));
    let item_snooze3 = make_item(mtm, id_snooze3(), ns_string!("Snooze"), &*target, sel!(onSnooze3:));
    let item_reports = make_item(mtm, id_reports(), ns_string!("Reports"), &*target, sel!(onReports:));
    let item_settings = make_item(mtm, id_settings(), ns_string!("Settings"), &*target, sel!(onSettings:));

    let bar = NSTouchBar::new(mtm);

    let default_ids = NSArray::from_slice(&[
      id_parse(),
      NSTouchBarItemIdentifierFixedSpaceSmall,
      id_next(),
      NSTouchBarItemIdentifierFlexibleSpace,
      id_pay(),
      id_snooze3(),
      NSTouchBarItemIdentifierFlexibleSpace,
      id_reports(),
      id_settings(),
    ]);

    bar.setDefaultItemIdentifiers(&default_ids);

    let items: [Retained<NSTouchBarItem>; 6] = [
      item_parse.into_super(),
      item_next.into_super(),
      item_pay.into_super(),
      item_snooze3.into_super(),
      item_reports.into_super(),
      item_settings.into_super(),
    ];
    let items_set: Retained<NSSet<NSTouchBarItem>> = NSSet::from_retained_slice(&items);
    bar.setTemplateItems(&items_set);

    let _: () = msg_send![ns_window, setTouchBar: &*bar];
  }

  Ok(())
}
