//! Translations for the tray menu. The texts live in the same JSON files as the interface (src/locales).

use serde_json::Value;
use std::sync::OnceLock;

macro_rules! locales {
    ($($code:literal),* $(,)?) => {
        pub const LANGUAGES: &[&str] = &[$($code),*];
        fn raw(code: &str) -> &'static str {
            match code {
                $($code => include_str!(concat!("../../src/locales/", $code, ".json")),)*
                _ => include_str!("../../src/locales/en.json"),
            }
        }
    };
}

locales!["ru", "en", "uk", "kk", "be", "uz", "hy", "ka", "az", "de", "es", "fr", "pt-BR", "tr", "zh-CN"];

/// Languages of the CIS countries: here the app shows the МЗР diary promo.
const CIS: &[&str] = &["ru", "uk", "kk", "be", "uz", "hy", "ka", "az"];

pub fn is_cis(lang: &str) -> bool {
    CIS.contains(&lang)
}

fn parsed() -> &'static Vec<(&'static str, Value)> {
    static CACHE: OnceLock<Vec<(&'static str, Value)>> = OnceLock::new();
    CACHE.get_or_init(|| {
        LANGUAGES
            .iter()
            .map(|code| (*code, serde_json::from_str(raw(code)).expect("broken locale json")))
            .collect()
    })
}

/// "ru-RU" → "ru", "pt-PT" → "pt-BR", "zh-Hans-CN" → "zh-CN", anything unknown → "en".
pub fn resolve(requested: &str) -> &'static str {
    let lower = requested.replace('_', "-").to_lowercase();
    if let Some(exact) = LANGUAGES.iter().find(|c| c.to_lowercase() == lower) {
        return exact;
    }
    let base = lower.split('-').next().unwrap_or("");
    match base {
        "pt" => "pt-BR",
        "zh" => "zh-CN",
        _ => LANGUAGES.iter().find(|c| **c == base).copied().unwrap_or("en"),
    }
}

pub fn system_language() -> &'static str {
    resolve(&sys_locale::get_locale().unwrap_or_else(|| "en".into()))
}

fn lookup<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    key.split('.').try_fold(value, |v, part| v.get(part))?.as_str()
}

/// `t("ru", "tray.nextBreak", &[("n", "5")])` → «До перерыва: 5 мин».
pub fn t(lang: &str, key: &str, vars: &[(&str, &str)]) -> String {
    let all = parsed();
    let find = |code: &str| all.iter().find(|(c, _)| *c == code).and_then(|(_, v)| lookup(v, key));
    let mut text = find(lang).or_else(|| find("en")).unwrap_or(key).to_string();
    for (name, value) in vars {
        text = text.replace(&format!("{{{{{name}}}}}"), value);
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_system_locales() {
        assert_eq!(resolve("ru-RU"), "ru");
        assert_eq!(resolve("pt-PT"), "pt-BR");
        assert_eq!(resolve("zh-Hans-CN"), "zh-CN");
        assert_eq!(resolve("uz_Latn_UZ"), "uz");
        assert_eq!(resolve("ja-JP"), "en");
    }

    #[test]
    fn interpolates_and_falls_back() {
        assert_eq!(t("ru", "tray.nextBreak", &[("n", "5")]), "До перерыва: 5 мин");
        assert_eq!(t("ru", "tray.today", &[("done", "1"), ("time", "2 ч")]), "Перерывов сегодня: 1 · за компьютером 2 ч");
        assert_eq!(t("xx", "tray.quit", &[]), t("en", "tray.quit", &[]));
    }

    #[test]
    fn every_language_has_every_tray_key() {
        let en: Value = serde_json::from_str(raw("en")).unwrap();
        let keys: Vec<String> = en["tray"].as_object().unwrap().keys().cloned().collect();
        for code in LANGUAGES {
            for key in &keys {
                let full = format!("tray.{key}");
                let v: Value = serde_json::from_str(raw(code)).unwrap();
                assert!(lookup(&v, &full).is_some_and(|s| !s.is_empty()), "{code}: {full}");
            }
        }
    }
}
