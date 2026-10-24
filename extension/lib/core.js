// Creators + shared helpers: language, number formatting, YouTube page detection.
// Loaded by the content script, popup, welcome page and background worker (and by node tests).
(function (root) {
  'use strict';
  const COUNTRIES = ['AR', 'AU', 'BD', 'BE', 'BR', 'CA', 'CL', 'CO', 'DE', 'DZ', 'EC', 'EG', 'ES', 'FR', 'GB', 'ID', 'IN', 'IQ', 'IT', 'JP', 'KE',
    'KR', 'MA', 'MX', 'MY', 'NG', 'NL', 'PE', 'PH', 'PK', 'PL', 'PT', 'RO', 'SA', 'TH', 'TR', 'TW', 'UA', 'US', 'VN', 'ZA'];
  const LANGS = ['en', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja'];
  const LOCALE = { en: 'en-US', pt: 'pt-BR', 'pt-PT': 'pt-PT', es: 'es', de: 'de-DE', ru: 'ru-RU', uk: 'uk-UA', ko: 'ko-KR', ja: 'ja-JP' };
  const HOME_COUNTRY = { en: 'US', pt: 'BR', 'pt-PT': 'PT', es: 'MX', de: 'DE', ru: 'US', uk: 'UA', ko: 'KR', ja: 'JP' };

  // English -> [pt, es, de, ru, uk, ko, ja]. pt-PT uses pt plus PT_PT.
  const S = {
    creators: ['Creators', 'Creators', 'Creators', 'Авторы', 'Автори', '크리에이터', 'クリエイター'],
    trending: ['Em alta', 'Tendencias', 'Trends', 'В тренде', 'У тренді', '인기', '急上昇'],
    music: ['Música', 'Música', 'Musik', 'Музыка', 'Музика', '음악', '音楽'],
    views30: ['Visualizações nos últimos 30 dias', 'Vistas en los últimos 30 días', 'Aufrufe der letzten 30 Tage', 'Просмотры за 30 дней', 'Перегляди за 30 днів', '최근 30일 조회수', '直近30日の再生回数'],
    subs: ['Inscritos', 'Suscriptores', 'Abonnenten', 'Подписчики', 'Підписники', '구독자', '登録者'],
    subs_sub: ['pessoas inscritas', 'personas suscritas', 'Personen haben abonniert', 'человек подписаны', 'людей підписані', '명이 구독 중', '人が登録'],
    earn: ['Ganhos estimados', 'Ganancias estimadas', 'Geschätzte Einnahmen', 'Оценка дохода', 'Оцінка доходу', '예상 수익', '推定収益'],
    earn_sub: ['por mês, com anúncios', 'al mes, por anuncios', 'pro Monat, durch Werbung', 'в месяц, с рекламы', 'на місяць, з реклами', '월간, 광고 수익', '月あたり・広告収入'],
    avg: ['Média de visualizações', 'Vistas promedio', 'Ø Aufrufe', 'Средние просмотры', 'Середні перегляди', '평균 조회수', '平均再生回数'],
    avg_sub: ['por vídeo', 'por video', 'pro Video', 'на видео', 'на відео', '영상당', '動画あたり'],
    comments: ['Comentários', 'Comentarios', 'Kommentare', 'Комментарии', 'Коментарі', '댓글', 'コメント'],
    last30: ['últimos 30 dias', 'últimos 30 días', 'letzte 30 Tage', 'за 30 дней', 'за 30 днів', '최근 30일', '直近30日'],
    graph: ['Visualizações por vídeo', 'Vistas por video', 'Aufrufe pro Video', 'Просмотры по видео', 'Перегляди за відео', '영상별 조회수', '動画ごとの再生回数'],
    long: ['Vídeos longos', 'Videos largos', 'Lange Videos', 'Длинные видео', 'Довгі відео', '긴 영상', '長尺動画'],
    shorts: ['Formato Shorts (≤3 min)', 'Formato Shorts (≤3 min)', 'Shorts-Länge (≤3 Min.)', 'Формат Shorts (≤3 мин)', 'Формат Shorts (≤3 хв)', 'Shorts 길이 (3분 이하)', 'ショート尺（3分以内）'],
    tap_dot: ['Toque num ponto para ver o vídeo', 'Toca un punto para ver el video', 'Tippe auf einen Punkt, um das Video zu sehen', 'Нажмите на точку, чтобы увидеть видео', 'Натисніть на точку, щоб побачити відео', '점을 눌러 영상을 확인하세요', '点をタップすると動画を表示'],
    top: ['Vídeos mais vistos', 'Videos más vistos', 'Meistgesehene Videos', 'Самые просматриваемые', 'Найпопулярніші відео', '인기 영상', '人気の動画'],
    report: ['Relatório completo', 'Informe completo', 'Vollständiger Bericht', 'Полный отчёт', 'Повний звіт', '전체 리포트', '詳細レポート'],
    updated: ['Atualizado {t}', 'Actualizado {t}', 'Aktualisiert {t}', 'Обновлено {t}', 'Оновлено {t}', '{t} 업데이트', '{t}に更新'],
    loading: ['Carregando…', 'Cargando…', 'Wird geladen…', 'Загрузка…', 'Завантаження…', '불러오는 중…', '読み込み中…'],
    nodata: ['Ainda não temos dados deste canal', 'Aún no tenemos datos de este canal', 'Für diesen Kanal gibt es noch keine Daten', 'По этому каналу пока нет данных', 'Для цього каналу ще немає даних', '아직 이 채널의 데이터가 없습니다', 'このチャンネルのデータはまだありません'],
    load_now: ['Carregar agora', 'Cargar ahora', 'Jetzt laden', 'Загрузить', 'Завантажити', '지금 불러오기', '今すぐ読み込む'],
    refreshing: ['Buscando os números mais recentes…', 'Buscando los números más recientes…', 'Neueste Zahlen werden geladen…', 'Получаем свежие данные…', 'Отримуємо свіжі дані…', '최신 수치를 가져오는 중…', '最新の数値を取得中…'],
    offline: ['Não foi possível conectar ao Like Polling.', 'No se pudo conectar con Like Polling.', 'Like Polling ist nicht erreichbar.', 'Не удалось подключиться к Like Polling.', 'Не вдалося підключитися до Like Polling.', 'Like Polling에 연결할 수 없습니다.', 'Like Pollingに接続できません。'],
    retry: ['Tentar de novo', 'Reintentar', 'Erneut versuchen', 'Повторить', 'Повторити', '다시 시도', '再試行'],
    saved: ['Dados salvos', 'Datos guardados', 'Gespeicherte Daten', 'Сохранённые данные', 'Збережені дані', '저장된 데이터', '保存データ'],
    worldwide: ['Mundo', 'Mundial', 'Weltweit', 'Весь мир', 'Увесь світ', '전 세계', '世界'],
    speed: ['Velocidade', 'Velocidad', 'Tempo', 'Скорость', 'Швидкість', '속도', 'スピード'],
    per_hour: ['/h', '/h', '/Std.', '/ч', '/год', '/시간', '/時'],
    per_day: ['/dia', '/día', '/Tag', '/день', '/день', '/일', '/日'],
    fastest: ['Mais rápido', 'Más rápido', 'Am schnellsten', 'Быстрее всех', 'Найшвидше', '가장 빠름', '最速'],
    in_countries: ['em {n} de {t} países', 'en {n} de {t} países', 'in {n} von {t} Ländern', 'в {n} из {t} стран', 'у {n} з {t} країн', '{t}개국 중 {n}개국', '{t}か国中{n}か国'],
    like_rate: ['Taxa de curtidas', 'Tasa de me gusta', 'Like-Quote', 'Доля лайков', 'Частка лайків', '좋아요 비율', '高評価率'],
    views: ['visualizações', 'vistas', 'Aufrufe', 'просмотров', 'переглядів', '조회수', '回'],
    open_channel: ['Abra um canal ou vídeo do YouTube para ver as estatísticas aqui.', 'Abre un canal o video de YouTube para ver sus estadísticas aquí.', 'Öffne einen YouTube-Kanal oder ein Video, um hier die Statistiken zu sehen.', 'Откройте канал или видео на YouTube, чтобы увидеть статистику.', 'Відкрийте канал або відео на YouTube, щоб побачити статистику.', 'YouTube 채널이나 영상을 열면 여기에 통계가 표시됩니다.', 'YouTubeのチャンネルか動画を開くと、ここに統計が表示されます。'],
    minimize: ['Minimizar', 'Minimizar', 'Minimieren', 'Свернуть', 'Згорнути', '최소화', '最小化'],
    full: ['Tela cheia', 'Pantalla completa', 'Vollbild', 'Во весь экран', 'На весь екран', '전체 화면', '全画面'],
    exit_full: ['Sair da tela cheia', 'Salir de pantalla completa', 'Vollbild beenden', 'Выйти из полноэкранного режима', 'Вийти з повноекранного режиму', '전체 화면 종료', '全画面を終了'],
    close: ['Fechar', 'Cerrar', 'Schließen', 'Закрыть', 'Закрити', '닫기', '閉じる'],
    show_on_page: ['Mostrar nesta página', 'Mostrar en esta página', 'Auf dieser Seite zeigen', 'Показать на странице', 'Показати на сторінці', '이 페이지에 표시', 'このページに表示'],
    country: ['País', 'País', 'Land', 'Страна', 'Країна', '국가', '国'],
    show_pill: ['Mostrar o botão flutuante no YouTube', 'Mostrar el botón flotante en YouTube', 'Schwebende Schaltfläche auf YouTube zeigen', 'Показывать плавающую кнопку на YouTube', 'Показувати плаваючу кнопку на YouTube', 'YouTube에 플로팅 버튼 표시', 'YouTubeにフローティングボタンを表示'],
    settings: ['Configurações', 'Ajustes', 'Einstellungen', 'Настройки', 'Налаштування', '설정', '設定'],
    w_title: ['Bem-vindo ao Creators +', 'Bienvenido a Creators +', 'Willkommen bei Creators +', 'Добро пожаловать в Creators +', 'Вітаємо в Creators +', 'Creators +에 오신 것을 환영합니다', 'Creators +へようこそ'],
    w_sub: ['Rankings do YouTube, quem está em alta e gráficos dos canais, direto no seu navegador.', 'Rankings de YouTube, quién es tendencia y gráficos de canales, directo en tu navegador.', 'YouTube-Rankings, wer gerade trendet und Kanal-Grafiken – direkt im Browser.', 'Рейтинги YouTube, кто в тренде и графики каналов прямо в браузере.', 'Рейтинги YouTube, хто в тренді та графіки каналів просто в браузері.', 'YouTube 순위, 지금 뜨는 영상, 채널 그래프를 브라우저에서 바로.', 'YouTubeのランキング、急上昇、チャンネルのグラフをブラウザで。'],
    w_q: ['De qual país você quer ver os rankings?', '¿De qué país quieres ver los rankings?', 'Die Rankings welches Landes möchtest du sehen?', 'Рейтинги какой страны показывать?', 'Рейтинги якої країни показувати?', '어느 나라의 순위를 볼까요?', 'どの国のランキングを表示しますか？'],
    w_lang: ['Idioma: {l} (do seu navegador)', 'Idioma: {l} (de tu navegador)', 'Sprache: {l} (aus deinem Browser)', 'Язык: {l} (из браузера)', 'Мова: {l} (з браузера)', '언어: {l} (브라우저 설정)', '言語：{l}（ブラウザの設定）'],
    w_pin: ['Dica: fixe o Creators +. Clique no ícone de peça na barra do Chrome e depois no alfinete ao lado de Creators +.', 'Consejo: fija Creators +. Haz clic en el icono de pieza de la barra de Chrome y luego en el pin junto a Creators +.', 'Tipp: Hefte Creators + an. Klicke in Chrome auf das Puzzle-Symbol und dann auf die Nadel neben Creators +.', 'Совет: закрепите Creators +. Нажмите на значок пазла в Chrome, затем на булавку рядом с Creators +.', 'Порада: закріпіть Creators +. Натисніть значок пазла в Chrome, потім шпильку біля Creators +.', '팁: Chrome 툴바의 퍼즐 아이콘을 누른 뒤 Creators + 옆의 핀을 눌러 고정하세요.', 'ヒント：Chromeのパズルアイコンを押し、Creators +の横のピンで固定しましょう。'],
    w_start: ['Começar', 'Empezar', 'Los geht’s', 'Начать', 'Почати', '시작하기', '始める'],
    w_done: ['Pronto! Abra qualquer canal ou vídeo do YouTube para experimentar.', '¡Listo! Abre cualquier canal o video de YouTube para probarlo.', 'Fertig! Öffne einen beliebigen YouTube-Kanal oder ein Video zum Ausprobieren.', 'Готово! Откройте любой канал или видео на YouTube.', 'Готово! Відкрийте будь-який канал або відео на YouTube.', '완료! YouTube 채널이나 영상을 열어 보세요.', '完了！YouTubeのチャンネルか動画を開いて試してみてください。'],
    w_noacct: ['Sem conta, sem cadastro.', 'Sin cuenta ni registro.', 'Kein Konto, keine Anmeldung.', 'Без аккаунта и регистрации.', 'Без акаунта та реєстрації.', '계정이나 가입이 필요 없습니다.', 'アカウント登録は不要です。'],
    w_privacy: ['Só enviamos o canal que você está vendo e o seu país. Nunca o conteúdo da página nem o seu histórico.', 'Solo enviamos el canal que estás viendo y tu país. Nunca el contenido de la página ni tu historial.', 'Wir senden nur den angesehenen Kanal und dein Land – nie Seiteninhalte oder deinen Verlauf.', 'Мы отправляем только канал, который вы смотрите, и вашу страну. Никогда — содержимое страниц или историю.', 'Ми надсилаємо лише канал, який ви дивитеся, і вашу країну. Ніколи — вміст сторінок чи історію.', '보고 있는 채널과 국가만 전송합니다. 페이지 내용이나 기록은 절대 보내지 않습니다.', '送信するのは表示中のチャンネルと国だけ。ページの内容や履歴は送信しません。'],
    earn_note: ['US$ 1–4 a cada 1.000 visualizações (estimativa)', 'US$1–4 por cada 1.000 vistas (estimación)', '1–4 US$ pro 1.000 Aufrufe (Schätzung)', '$1–4 за 1000 просмотров (оценка)', '$1–4 за 1000 переглядів (оцінка)', '조회수 1,000회당 $1–4 (추정)', '1,000回再生あたり$1〜4（推定）'],
    speed_h: ['visualizações por hora desde a publicação', 'vistas por hora desde la publicación', 'Aufrufe pro Stunde seit Veröffentlichung', 'просмотров в час с момента публикации', 'переглядів на годину від публікації', '게시 후 시간당 조회수', '公開からの1時間あたり再生回数'],
    speed_d: ['visualizações por dia desde a publicação', 'vistas por día desde la publicación', 'Aufrufe pro Tag seit Veröffentlichung', 'просмотров в день с момента публикации', 'переглядів на день від публікації', '게시 후 일일 조회수', '公開からの1日あたり再生回数'],
    no_rows: ['Ainda não há ranking para este país.', 'Aún no hay ranking para este país.', 'Für dieses Land gibt es noch kein Ranking.', 'Для этой страны пока нет рейтинга.', 'Для цієї країни ще немає рейтингу.', '이 국가의 순위가 아직 없습니다.', 'この国のランキングはまだありません。'],
    channel_hint: ['Abra o painel para ver os gráficos', 'Abre el panel para ver los gráficos', 'Panel öffnen für Grafiken', 'Откройте панель с графиками', 'Відкрийте панель з графіками', '패널을 열어 그래프 보기', 'パネルでグラフを表示'],
    education: ["Educação", "Educación", "Bildung", "Образование", "Освіта", "교육", "教育"],
    edu_index: ["Índice de Educação", "Índice de Educación", "Bildungs-Index", "Индекс образования", "Індекс освіти", "교육 지수", "教育指数"],
    edu_subjects: ["Assuntos mais comentados", "Temas más comentados", "Meistdiskutierte Themen", "Самые обсуждаемые темы", "Найобговорюваніші теми", "가장 많이 이야기되는 주제", "最も話題の分野"],
    n_videos: ["{n} vídeos", "{n} videos", "{n} Videos", "{n} видео", "{n} відео", "영상 {n}개", "動画{n}本"],
    n_video: ["{n} vídeo", "{n} video", "{n} Video", "{n} видео", "{n} відео", "영상 {n}개", "動画{n}本"],
    n_news: ["{n} notícias", "{n} noticias", "{n} Meldungen", "{n} новостей", "{n} новин", "뉴스 {n}건", "ニュース{n}件"],
    no_edu: ["Ainda não há dados de educação para este país.", "Aún no hay datos de educación para este país.", "Für dieses Land gibt es noch keine Bildungsdaten.", "Для этой страны пока нет данных об образовании.", "Для цієї країни ще немає даних про освіту.", "이 국가의 교육 데이터가 아직 없습니다.", "この国の教育データはまだありません。"],
    edu_note: ["YouTube + Google News, classificados por assunto por IA. Mostra o que está sendo comentado, não matrículas.", "YouTube + Google News, clasificados por tema con IA. Muestra de qué se habla, no matrículas.", "YouTube + Google News, von KI nach Themen sortiert. Zeigt, worüber gesprochen wird, keine Einschreibungen.", "YouTube + Google News, распределены по темам с помощью ИИ. Показывает, что обсуждают, а не запись на курсы.", "YouTube + Google News, розподілені за темами за допомогою ШІ. Показує, що обговорюють, а не запис на курси.", "YouTube + Google 뉴스를 AI가 주제별로 분류. 등록 현황이 아니라 이야기되는 주제입니다.", "YouTube＋Googleニュースを AI が分野別に分類。履修状況ではなく話題の分野です。"],
    s_ai_tech: ["IA e Tecnologia", "IA y Tecnología", "KI & Technik", "ИИ и технологии", "ШІ та технології", "AI·기술", "AI・テクノロジー"],
    s_space_physics: ["Espaço e Física", "Espacio y Física", "Weltall & Physik", "Космос и физика", "Космос і фізика", "우주·물리", "宇宙・物理"],
    s_math: ["Matemática", "Matemáticas", "Mathematik", "Математика", "Математика", "수학", "数学"],
    s_health_biology: ["Saúde e Biologia", "Salud y Biología", "Gesundheit & Biologie", "Здоровье и биология", "Здоров’я та біологія", "건강·생물", "健康・生物"],
    s_chemistry: ["Química", "Química", "Chemie", "Химия", "Хімія", "화학", "化学"],
    s_climate_environment: ["Clima e Meio Ambiente", "Clima y Medio Ambiente", "Klima & Umwelt", "Климат и экология", "Клімат і довкілля", "기후·환경", "気候・環境"],
    s_history_geography: ["História e Geografia", "Historia y Geografía", "Geschichte & Geografie", "История и география", "Історія та географія", "역사·지리", "歴史・地理"],
    s_engineering: ["Engenharia e Como as coisas funcionam", "Ingeniería y Cómo funcionan las cosas", "Technik & Wie Dinge funktionieren", "Инженерия и как всё устроено", "Інженерія і як усе влаштовано", "공학·작동 원리", "工学・しくみ"],
    s_exams_admissions: ["Vestibulares e Provas", "Exámenes y Admisiones", "Prüfungen & Zulassung", "Экзамены и поступление", "Іспити та вступ", "시험·입시", "試験・入試"],
    s_schools_policy: ["Escolas e Políticas", "Escuelas y Políticas", "Schulen & Bildungspolitik", "Школы и политика", "Школи та політика", "학교·교육 정책", "学校・教育政策"],
    s_money_careers: ["Dinheiro e Carreiras", "Dinero y Carreras", "Geld & Karriere", "Деньги и карьера", "Гроші та кар’єра", "돈·커리어", "お金・キャリア"],
    s_languages_culture: ["Idiomas e Artes", "Idiomas y Artes", "Sprachen & Kunst", "Языки и искусство", "Мови та мистецтво", "언어·예술", "語学・芸術"],
  };
  const PT_PT = {
    edu_note: "YouTube + Google News, classificados por assunto por IA. Mostra o que está a ser comentado, não inscrições.", s_climate_environment: "Clima e Ambiente", s_exams_admissions: "Exames e Candidaturas",
    w_title: 'Bem-vindo ao Creators +', creators: 'Criadores', trending: 'Em destaque', subs: 'Subscritores', subs_sub: 'pessoas subscritas',
    tap_dot: 'Toque num ponto para ver o vídeo', w_q: 'De que país quer ver os rankings?', w_pin: 'Dica: afixe o Creators +. Clique no ícone de peça na barra do Chrome e depois no pionés ao lado de Creators +.',
    w_done: 'Pronto! Abra qualquer canal ou vídeo do YouTube para experimentar.', w_lang: 'Idioma: {l} (do seu navegador)', like_rate: 'Taxa de gostos',
    w_privacy: 'Só enviamos o canal que está a ver e o seu país. Nunca o conteúdo da página nem o seu histórico.', w_noacct: 'Sem conta, sem registo.',
    w_sub: 'Rankings do YouTube, o que está em destaque e gráficos dos canais, diretamente no seu navegador.', earn_note: 'US$ 1–4 por cada 1000 visualizações (estimativa)',
  };
  const EN = {
    creators: 'Creators', trending: 'Trending', music: 'Music', views30: 'Views in the last 30 days', subs: 'Subscribers', subs_sub: 'people subscribed',
    earn: 'Est. earnings', earn_sub: 'per month, from ads', avg: 'Avg. views', avg_sub: 'per video', comments: 'Comments', last30: 'last 30 days',
    graph: 'Views per video', long: 'Long-form', shorts: 'Shorts-length (≤3 min)', tap_dot: 'Tap a dot to see the video', top: 'Top videos',
    report: 'Full report', updated: 'Updated {t}', loading: 'Loading…', nodata: 'No data yet for this channel', load_now: 'Load it now',
    refreshing: 'Getting the latest numbers…', offline: 'Can’t reach Like Polling.', retry: 'Try again', saved: 'Saved data', worldwide: 'Worldwide',
    speed: 'Speed', per_hour: '/h', per_day: '/day', fastest: 'Fastest', in_countries: 'in {n} of {t} countries', like_rate: 'Like rate', views: 'views',
    open_channel: 'Open a YouTube channel or video to see its stats here.', minimize: 'Minimize', full: 'Full screen', exit_full: 'Exit full screen',
    close: 'Close', show_on_page: 'Show on this page', country: 'Country', show_pill: 'Show the floating pill on YouTube', settings: 'Settings',
    w_title: 'Welcome to Creators +', w_sub: 'YouTube’s rankings, who’s trending and channel graphs, right in your browser.',
    w_q: 'Which country’s rankings do you want to see?', w_lang: 'Language: {l} (from your browser)',
    w_pin: 'Tip: pin Creators +. Click the puzzle icon in Chrome’s toolbar, then the pin next to Creators +.', w_start: 'Start',
    w_done: 'All set! Open any YouTube channel or video to try it.', w_noacct: 'No account, no sign-up.',
    w_privacy: 'We only send the channel you’re viewing and your country. Never page contents or your history.',
    earn_note: '$1–$4 per 1,000 views (estimate)', speed_h: 'views per hour since posting', speed_d: 'views per day since posting',
    no_rows: 'No ranking for this country yet.', channel_hint: 'Open the panel for graphs',
    education: "Education",
    edu_index: "Education Index",
    edu_subjects: "Most talked-about subjects",
    n_video: "{n} video",
    n_videos: "{n} videos",
    n_news: "{n} news",
    no_edu: "No education data for this country yet.",
    edu_note: "YouTube + Google News, sorted into subjects by AI. Shows what is talked about, not enrollment.",
    s_ai_tech: "AI & Technology",
    s_space_physics: "Space & Physics",
    s_math: "Math",
    s_health_biology: "Health & Biology",
    s_chemistry: "Chemistry",
    s_climate_environment: "Climate & Environment",
    s_history_geography: "History & Geography",
    s_engineering: "Engineering & How things work",
    s_exams_admissions: "Exams & Admissions",
    s_schools_policy: "Schools & Policy",
    s_money_careers: "Money & Careers",
    s_languages_culture: "Languages & Arts",
  };

  function detectLang(nav) {
    const list = [].concat(nav || []).map((l) => String(l));
    for (const l of list) {
      if (/^pt-PT/i.test(l)) return 'pt-PT';
      const base = l.slice(0, 2).toLowerCase();
      if (LANGS.includes(base)) return base;
    }
    return 'en';
  }

  function translator(lang) {
    const col = ['pt', 'es', 'de', 'ru', 'uk', 'ko', 'ja'].indexOf(lang === 'pt-PT' ? 'pt' : lang);
    return (key, vars = {}) => {
      let s = (lang === 'pt-PT' && PT_PT[key]) || (col >= 0 && S[key] ? S[key][col] : null) || EN[key] || key;
      for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
      return s;
    };
  }

  function formatter(lang) {
    const loc = LOCALE[lang] || 'en-US';
    const compact = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });
    const money = new Intl.NumberFormat(loc, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
    const pct = new Intl.NumberFormat(loc, { style: 'percent', maximumFractionDigits: 1 });
    const rel = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
    let names = null;
    try { names = new Intl.DisplayNames([loc], { type: 'region' }); } catch (e) { /* old browser */ }
    return {
      num: (n) => (n == null || isNaN(n) ? '—' : compact.format(Number(n))),
      usd: (n) => (n == null || isNaN(n) ? '—' : money.format(Number(n))),
      pct: (n) => (n == null || isNaN(n) ? '—' : pct.format(Number(n))),
      date: (iso) => new Date(iso).toLocaleDateString(loc, { day: 'numeric', month: 'short' }),
      ago: (iso, now = Date.now()) => {
        const s = (Date.parse(iso) - now) / 1000;
        const [v, u] = Math.abs(s) < 3600 ? [s / 60, 'minute'] : Math.abs(s) < 86400 ? [s / 3600, 'hour'] : [s / 86400, 'day'];
        return rel.format(Math.round(v), u);
      },
      country: (code) => (names && names.of(code)) || code,
    };
  }

  // What kind of YouTube page this is, from the URL alone.
  function pageKind(href) {
    let u;
    try { u = new URL(href); } catch (e) { return { type: 'other' }; }
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return { type: 'other' };
    const p = u.pathname;
    let m = p.match(/^\/@([^/?#]+)/);
    if (m) {
      const handle = safeDecode(m[1]);
      return handle ? { type: 'channel', ref: { handle } } : { type: 'other' };
    }
    m = p.match(/^\/channel\/(UC[\w-]{22})/);
    if (m) return { type: 'channel', ref: { id: m[1] } };
    if (/^\/(c|user)\/[^/]+/.test(p)) return { type: 'legacy-channel' };
    if (p === '/watch' && u.searchParams.get('v')) return { type: 'watch', videoId: u.searchParams.get('v') };
    m = p.match(/^\/shorts\/([\w-]{6,})/);
    if (m) return { type: 'shorts', videoId: m[1] };
    return { type: 'other' };
  }

  function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { return null; } }

  // A channel link (owner link on a watch page, canonical URL) -> { handle } | { id } | null.
  function channelRefFromHref(href) {
    if (!href) return null;
    const k = pageKind(new URL(href, 'https://www.youtube.com').href);
    return k.type === 'channel' ? k.ref : null;
  }

  const refKey = (ref) => (ref ? (ref.id ? `id:${ref.id}` : `handle:${String(ref.handle).toLowerCase()}`) : '');
  const refQuery = (ref) => (ref.id ? `id=${encodeURIComponent(ref.id)}` : `handle=${encodeURIComponent('@' + ref.handle)}`);

  const api = { COUNTRIES, LANGS, LOCALE, HOME_COUNTRY, detectLang, translator, formatter, pageKind, channelRefFromHref, refKey, refQuery };
  root.CP = Object.assign(root.CP || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
