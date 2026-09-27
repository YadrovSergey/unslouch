/**
 * Comparison data. Every competitor fact was checked on 27 September 2026 against the official site,
 * GitHub repository or App Store page listed in `checked`. A cell we could not confirm is `null` and is shown
 * empty. Keep the tone neutral: facts, no "better".
 */
import type { Lang } from "../i18n";

export const ROWS = ["price", "source", "platforms", "eyes", "exercises", "cues", "calls", "quiet", "stats", "languages", "data"] as const;
export type Row = (typeof ROWS)[number];
type Text = Record<Lang, string>;
type Cells = Record<Row, Text | null>;

export interface App {
  slug: string;
  name: string;
  url: string;
  checked: string[];
  cells: Cells;
  summary: Text;
  common: Text;
  suits: Record<Lang, string[]>;
}

export const OURS: Cells = {
  price: { en: "Free", ru: "Бесплатно" },
  source: { en: "Open source, MIT", ru: "Открытый, MIT" },
  platforms: { en: "macOS, Windows, Linux, plus free tools in the browser", ru: "macOS, Windows, Linux и бесплатные инструменты в браузере" },
  eyes: {
    en: "Every 20 min one small exercise, then look more than 6 m (20 ft) away for 20 s",
    ru: "Каждые 20 минут маленькое упражнение, потом 20 секунд смотреть дальше 6 метров",
  },
  exercises: {
    en: "Animated exercises by body part: eyes, neck, back, hands, legs, breathing. With sources and when to see a doctor",
    ru: "Анимированные упражнения по частям тела: глаза, шея, спина, кисти, ноги, дыхание. С источниками и тем, когда идти к врачу",
  },
  cues: {
    en: "Gentle cues without windows: screen edges darken to blink, a posture banner, a water card",
    ru: "Тихие сигналы без окон: края экрана темнеют, чтобы моргнуть, плашка про позу, карточка про воду",
  },
  calls: { en: "Waits while another program uses the camera or microphone", ru: "Ждёт, пока другая программа пользуется камерой или микрофоном" },
  quiet: {
    en: "Waits in fullscreen and Do Not Disturb, outside work hours, during Focus 25/50",
    ru: "Ждёт на полном экране и в «Не беспокоить», вне рабочих часов, во время фокуса 25/50",
  },
  stats: {
    en: "Time at the computer, longest sitting stretch, streaks, year heatmap, achievements, time per program. All on your computer",
    ru: "Время за компьютером, самый долгий отрезок сидя, серии, карта года, достижения, время по программам. Всё хранится у вас",
  },
  languages: { en: "15", ru: "15" },
  data: { en: "Nothing is collected", ru: "Ничего не собирает" },
};

export const COMPETITORS: App[] = [
  {
    slug: "stretchly",
    name: "Stretchly",
    url: "https://hovancik.net/stretchly/",
    checked: ["https://hovancik.net/stretchly/", "https://github.com/hovancik/stretchly"],
    cells: {
      price: { en: "Free, donations welcome", ru: "Бесплатно, можно поддержать донатом" },
      source: { en: "Open source, BSD-2-Clause", ru: "Открытый, BSD-2-Clause" },
      platforms: { en: "macOS, Windows, Linux", ru: "macOS, Windows, Linux" },
      eyes: {
        en: "Mini breaks of 20 s every 10 min, long breaks of 5 min every 30 min (defaults, adjustable)",
        ru: "Мини-перерывы по 20 секунд каждые 10 минут, длинные по 5 минут каждые 30 (по умолчанию, настраивается)",
      },
      exercises: { en: "Text break ideas, you can add your own", ru: "Текстовые идеи для перерыва, можно добавить свои" },
      cues: null,
      calls: null,
      quiet: { en: "Pauses in fullscreen, in Do Not Disturb and when idle", ru: "Пауза на полном экране, в «Не беспокоить» и при бездействии" },
      stats: { en: "Break Health indicator for skipped breaks", ru: "Индикатор, если перерывы часто пропускаются" },
      languages: { en: "Many, translated by the community", ru: "Много, переводит сообщество" },
      data: null,
    },
    summary: {
      en: "Stretchly is a well-known free and open-source break reminder for macOS, Windows and Linux. It has mini and long breaks, a strict mode and support for several monitors.",
      ru: "Stretchly давно известна: бесплатная, с открытым кодом, для macOS, Windows и Linux. В ней есть мини-перерывы и длинные перерывы, строгий режим и поддержка нескольких мониторов.",
    },
    common: {
      en: "Both are free and open source, run on all three desktop systems and wait in fullscreen and Do Not Disturb.",
      ru: "Обе бесплатные, с открытым кодом, работают на всех трёх системах и ждут на полном экране и в «Не беспокоить».",
    },
    suits: {
      en: [
        "You want a strict mode that makes skipping breaks harder.",
        "You like writing your own break ideas, with HTML and pictures.",
        "You want a mature project with a long history and many translations.",
      ],
      ru: [
        "Нужен строгий режим, в котором перерыв сложнее пропустить.",
        "Хочется писать свои идеи для перерыва, с HTML и картинками.",
        "Важен зрелый проект с долгой историей и множеством переводов.",
      ],
    },
  },
  {
    slug: "lookaway",
    name: "LookAway",
    url: "https://lookaway.com/",
    checked: ["https://lookaway.com/", "https://lookaway.com/pricing", "https://lookaway.com/privacy", "https://apps.apple.com/us/app/lookaway-break-reminder/id6747192301"],
    cells: {
      price: {
        en: "From $19 one-time on the site; in the Mac App Store a free download with subscription or lifetime options",
        ru: "На сайте от $19 разово; в Mac App Store бесплатная загрузка с подпиской или покупкой навсегда",
      },
      source: null,
      platforms: { en: "macOS 13 or later (Windows announced), iPhone and iPad companion", ru: "macOS 13 и новее (Windows обещают), компаньон для iPhone и iPad" },
      eyes: { en: "Eye breaks every 20 minutes, short and long breaks", ru: "Перерывы для глаз каждые 20 минут, короткие и длинные перерывы" },
      exercises: null,
      cues: { en: "Posture and blink reminders", ru: "Напоминания о позе и моргании" },
      calls: { en: "Smart Pause during meetings and calls", ru: "Умная пауза во время встреч и звонков" },
      quiet: { en: "Pauses for fullscreen games and apps, works with Focus Filters", ru: "Пауза в полноэкранных играх и приложениях, работает с фильтрами фокусирования" },
      stats: { en: "Screen time dashboard, break history, app and website usage", ru: "Экранное время, история перерывов, приложения и сайты" },
      languages: { en: "8", ru: "8" },
      data: { en: "Anonymous analytics (Mixpanel) that can be turned off", ru: "Анонимная аналитика (Mixpanel), её можно выключить" },
    },
    summary: {
      en: "LookAway is a polished paid break reminder for Mac by Mystical Bits. It has posture and blink reminders, Smart Pause for meetings and a screen time dashboard.",
      ru: "LookAway от Mystical Bits сделан аккуратно, он платный и только для Mac. В нём есть напоминания о позе и моргании, умная пауза на встречах и статистика экранного времени.",
    },
    common: {
      en: "Both remind you to look away every 20 minutes, remind you to blink and change posture, and wait during calls and in fullscreen.",
      ru: "Обе напоминают каждые 20 минут посмотреть вдаль, моргнуть и сменить позу и ждут на созвонах и на полном экране.",
    },
    suits: {
      en: [
        "You use only a Mac and want deep integration with macOS Focus Filters.",
        "You want a companion app on iPhone or iPad that blocks apps during a break.",
        "You want screen time and website usage in one dashboard.",
      ],
      ru: [
        "У вас только Mac и нужна глубокая связка с фильтрами фокусирования macOS.",
        "Нужен компаньон на iPhone или iPad, который блокирует приложения на перерыве.",
        "Хочется видеть экранное время и сайты в одной панели.",
      ],
    },
  },
  {
    slug: "breaktimer",
    name: "BreakTimer",
    url: "https://breaktimer.app/",
    checked: ["https://breaktimer.app/", "https://github.com/tom-james-watson/breaktimer-app"],
    cells: {
      price: { en: "Free", ru: "Бесплатно" },
      source: { en: "Open source, GPL-3.0", ru: "Открытый, GPL-3.0" },
      platforms: { en: "Windows, macOS, Linux", ru: "Windows, macOS, Linux" },
      eyes: {
        en: "Configurable interval and length, as a notification or a fullscreen break",
        ru: "Интервал и длительность настраиваются, перерыв уведомлением или на весь экран",
      },
      exercises: null,
      cues: null,
      calls: null,
      quiet: { en: "Working hours; the timer resets when you are idle", ru: "Рабочие часы; таймер сбрасывается при бездействии" },
      stats: null,
      languages: null,
      data: null,
    },
    summary: {
      en: "BreakTimer is a simple free and open-source app for Windows, macOS and Linux. You set how often and how long, and it shows a notification or a fullscreen break with your own text and colours.",
      ru: "Бесплатная программа BreakTimer с открытым кодом работает на Windows, macOS и Linux. Вы задаёте, как часто и как долго отдыхать, а она показывает уведомление или перерыв на весь экран с вашим текстом и цветами.",
    },
    common: {
      en: "Both are free and open source, run on all three desktop systems, know your working hours and count being away as rest.",
      ru: "Обе бесплатные, с открытым кодом, работают на трёх системах, знают рабочие часы и считают отход от компьютера отдыхом.",
    },
    suits: {
      en: ["You need one simple timer and nothing else.", "You want to write your own break message and pick colours."],
      ru: ["Нужен один простой таймер и больше ничего.", "Хочется написать свой текст перерыва и выбрать цвета."],
    },
  },
  {
    slug: "time-out",
    name: "Time Out",
    url: "https://www.dejal.com/timeout/",
    checked: ["https://www.dejal.com/timeout/", "https://apps.apple.com/us/app/time-out-break-reminders/id402592703"],
    cells: {
      price: { en: "Free, optional supporter purchases from $4.99", ru: "Бесплатно, по желанию поддержка от $4.99" },
      source: { en: "Closed source", ru: "Закрытый" },
      platforms: { en: "macOS only", ru: "Только macOS" },
      eyes: {
        en: "Micro breaks of 15 s every 15 min, Normal breaks of 10 min every hour, your own types",
        ru: "Микро по 15 секунд каждые 15 минут, обычный по 10 минут каждый час, можно свои",
      },
      exercises: { en: "Break themes: HTML, websites, video, images, including desk exercise themes", ru: "Темы перерыва: HTML, сайты, видео, картинки, в том числе с упражнениями" },
      cues: null,
      calls: { en: "Rules for apps, calendar events and video meetings", ru: "Правила для приложений, событий календаря и видеовстреч" },
      quiet: { en: "Rules for fullscreen", ru: "Правила для полного экрана" },
      stats: { en: "Activity charts: breaks, app usage, time away", ru: "Графики активности: перерывы, приложения, время вне Mac" },
      languages: { en: "English", ru: "Английский" },
      data: { en: "App Store label: contact info and diagnostics linked to you", ru: "По ярлыку App Store: контакты и диагностика, связанные с пользователем" },
    },
    summary: {
      en: "Time Out by Dejal is a long-standing break reminder for Mac. It has micro and normal breaks, flexible rules, themes and automation with AppleScript and Automator.",
      ru: "Time Out от Dejal напоминает о перерывах на Mac уже много лет. В нём микро- и обычные перерывы, гибкие правила, темы и автоматизация через AppleScript и Automator.",
    },
    common: {
      en: "Both have short and long breaks, wait during video meetings and in fullscreen, count time away as rest and keep statistics.",
      ru: "В обеих есть короткие и длинные перерывы, обе ждут на видеовстречах и на полном экране, считают отход отдыхом и ведут статистику.",
    },
    suits: {
      en: [
        "You use only a Mac and like to automate with AppleScript, Automator or scripts.",
        "You want to show your own web pages or videos during a break.",
        "You want rules tied to calendar events.",
      ],
      ru: [
        "У вас только Mac и нравится автоматизировать через AppleScript, Automator или скрипты.",
        "Хочется показывать на перерыве свои страницы или видео.",
        "Нужны правила, привязанные к событиям календаря.",
      ],
    },
  },
  {
    slug: "deskbreak",
    name: "DeskBreak",
    url: "https://www.deskbreak.app/",
    checked: ["https://www.deskbreak.app/", "https://www.deskbreak.app/features", "https://www.deskbreak.app/features/break-reminders"],
    cells: {
      price: {
        en: "$39 one-time or $19 a year, 14-day trial; the Chrome extension is free",
        ru: "$39 разово или $19 в год, 14 дней на пробу; расширение для Chrome бесплатное",
      },
      source: null,
      platforms: { en: "macOS, Windows, Linux, extension for Chrome, Edge and Brave", ru: "macOS, Windows, Linux, расширение для Chrome, Edge и Brave" },
      eyes: { en: "Preset for eye breaks every 20 minutes", ru: "Готовый режим: каждые 20 минут смотреть вдаль 20 секунд" },
      exercises: { en: "Desk exercise library", ru: "Библиотека упражнений за столом" },
      cues: { en: "Hydration among break activities", ru: "Вода среди занятий на перерыве" },
      calls: { en: "Calendar integration so meetings are not interrupted", ru: "Связь с календарём, чтобы не прерывать встречи" },
      quiet: { en: "Manual Focus Mode", ru: "Ручной режим фокуса" },
      stats: { en: "Activity streaks, yearly graphs, analytics", ru: "Серии, графики за год, аналитика" },
      languages: null,
      data: null,
    },
    summary: {
      en: "DeskBreak is a paid desktop break reminder for macOS, Windows and Linux with a free browser extension. It has an eye break preset, a desk exercise library, calendar integration and streaks.",
      ru: "DeskBreak состоит из платного приложения для macOS, Windows и Linux и бесплатного расширения для браузера. В нём есть готовый режим для глаз, библиотека упражнений, связь с календарём и серии дней.",
    },
    common: {
      en: "Both work on macOS, Windows and Linux and in the browser, remind you about eyes and water, and count streaks.",
      ru: "Обе работают на macOS, Windows, Linux и в браузере, напоминают о глазах и воде и считают серии дней.",
    },
    suits: {
      en: ["You live by your calendar and want breaks to follow it.", "You mostly work in Chrome, Edge or Brave and want an extension."],
      ru: ["Вы живёте по календарю и хотите, чтобы перерывы под него подстраивались.", "Вы в основном работаете в Chrome, Edge или Brave и хотите расширение."],
    },
  },
];
