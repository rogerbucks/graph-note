// The desktop app's start (spec §41, standalone_app). Windows builds open no console beside the window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    thoughtknot_app_lib::run()
}
