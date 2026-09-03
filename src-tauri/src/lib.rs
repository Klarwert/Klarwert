use keyring::Entry;

#[tauri::command]
fn set_api_credential(key: String, secret: String) -> Result<(), String> {
    let entry_key = Entry::new("com.aj.klarwert", "alpaca_api_key").map_err(|e| e.to_string())?;
    entry_key.set_password(&key).map_err(|e| e.to_string())?;
    
    let entry_secret = Entry::new("com.aj.klarwert", "alpaca_api_secret").map_err(|e| e.to_string())?;
    entry_secret.set_password(&secret).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn get_api_credential() -> Result<(String, String), String> {
    let entry_key = Entry::new("com.aj.klarwert", "alpaca_api_key").map_err(|e| e.to_string())?;
    let key = entry_key.get_password().unwrap_or_default();
    
    let entry_secret = Entry::new("com.aj.klarwert", "alpaca_api_secret").map_err(|e| e.to_string())?;
    let secret = entry_secret.get_password().unwrap_or_default();
    
    Ok((key, secret))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![set_api_credential, get_api_credential])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
