use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager, Runtime, WebviewWindow, Window, WindowEvent,
};

use crate::{store::AppPreferences, AppState};

const MAIN_WINDOW: &str = "main";
const MENU_SHOW: &str = "show";
const MENU_HIDE: &str = "hide";
const MENU_SETTINGS: &str = "settings";
const MENU_QUIT: &str = "quit";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayAction {
    ShowMainWindow,
    HideToTray,
    OpenSettings,
    Quit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowCloseAction {
    HideToTray,
    CloseWindow,
}

pub fn tray_menu_action(id: &str) -> Option<TrayAction> {
    match id {
        MENU_SHOW => Some(TrayAction::ShowMainWindow),
        MENU_HIDE => Some(TrayAction::HideToTray),
        MENU_SETTINGS => Some(TrayAction::OpenSettings),
        MENU_QUIT => Some(TrayAction::Quit),
        _ => None,
    }
}

pub fn window_close_action(preferences: &AppPreferences) -> WindowCloseAction {
    if preferences.close_to_tray {
        WindowCloseAction::HideToTray
    } else {
        WindowCloseAction::CloseWindow
    }
}

pub fn install_system_tray<R: Runtime>(app: &mut App<R>) -> tauri::Result<()> {
    let menu = MenuBuilder::new(app)
        .text(MENU_SHOW, "打开主窗口")
        .text(MENU_SETTINGS, "设置")
        .text(MENU_HIDE, "隐藏到托盘")
        .separator()
        .text(MENU_QUIT, "退出")
        .build()?;

    let mut tray = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("iim");
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

pub fn handle_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if window.label() != MAIN_WINDOW {
        return;
    }

    if let WindowEvent::CloseRequested { api, .. } = event {
        let preferences = window
            .app_handle()
            .state::<AppState>()
            .store()
            .load_app_preferences()
            .ok()
            .flatten()
            .unwrap_or_default();
        if window_close_action(&preferences) == WindowCloseAction::CloseWindow {
            return;
        }
        api.prevent_close();
        let _ = window.hide();
        let _ = window.emit("window:tray_status", "hidden");
    }
}

pub fn handle_menu_action<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match tray_menu_action(id) {
        Some(TrayAction::ShowMainWindow) => {
            let _ = show_main_window(app);
        }
        Some(TrayAction::HideToTray) => {
            let _ = hide_main_window(app);
        }
        Some(TrayAction::OpenSettings) => {
            let _ = show_main_window(app);
            let _ = app.emit("window:open_settings", "preferences");
        }
        Some(TrayAction::Quit) => app.exit(0),
        None => {}
    }
}

pub fn handle_tray_event<R: Runtime>(app: &AppHandle<R>, event: TrayIconEvent) {
    match event {
        TrayIconEvent::DoubleClick { button, .. } if button == MouseButton::Left => {
            let _ = show_main_window(app);
        }
        TrayIconEvent::Click {
            button,
            button_state,
            ..
        } if button == MouseButton::Left && button_state == MouseButtonState::Up => {
            let _ = show_main_window(app);
        }
        _ => {}
    }
}

pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let window = main_window(app)?;
    window.show()?;
    let _ = window.unminimize();
    window.set_focus()?;
    let _ = window.emit("window:tray_status", "visible");
    Ok(())
}

pub fn hide_main_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let window = main_window(app)?;
    window.hide()?;
    let _ = window.emit("window:tray_status", "hidden");
    Ok(())
}

fn main_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
    app.get_webview_window(MAIN_WINDOW)
        .ok_or_else(|| tauri::Error::WindowNotFound)
}

#[cfg(test)]
mod tests {
    use super::{tray_menu_action, window_close_action, TrayAction, WindowCloseAction};
    use crate::store::AppPreferences;

    #[test]
    fn tray_menu_maps_known_actions() {
        assert_eq!(tray_menu_action("show"), Some(TrayAction::ShowMainWindow));
        assert_eq!(tray_menu_action("hide"), Some(TrayAction::HideToTray));
        assert_eq!(tray_menu_action("settings"), Some(TrayAction::OpenSettings));
        assert_eq!(tray_menu_action("quit"), Some(TrayAction::Quit));
        assert_eq!(tray_menu_action("unknown"), None);
    }

    #[test]
    fn close_to_tray_preference_controls_window_close_action() {
        let mut preferences = AppPreferences::default();
        preferences.close_to_tray = true;
        assert_eq!(
            window_close_action(&preferences),
            WindowCloseAction::HideToTray
        );
        preferences.close_to_tray = false;
        assert_eq!(
            window_close_action(&preferences),
            WindowCloseAction::CloseWindow
        );
    }
}
