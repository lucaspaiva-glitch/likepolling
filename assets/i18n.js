// Site language switcher (EN | BR | PT | ES | DE | RU | UA | KO | JA). Load right after the page markup:
//   <script src="/assets/i18n.js"></script>
// Translates the page's English UI text in place, including text that scripts
// and widgets render later (watched with a MutationObserver), so existing code
// needs no changes. YouTube titles, channel names, AI summaries and anything
// inside [data-no-i18n] are left as they are. The choice is kept in localStorage
// and announced with a "lp:lang" event ({ detail: { lang } }) on document.
(function () {
  'use strict';
  const LANGS = ['en', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja'];
  // Dictionary columns. European Portuguese ('pt-PT') uses the 'pt' column plus the PT_PT overrides below.
  const COLS = ['pt', 'es', 'de', 'ru', 'uk', 'ko', 'ja'];
  // Button label, flag (assets/flags) and native name. Ukrainian shows "UA" so it isn't read as United Kingdom.
  const META = {
    en: ['EN', 'us', 'English'], pt: ['BR', 'br', 'Português (Brasil)'], 'pt-PT': ['PT', 'pt', 'Português (Portugal)'], es: ['ES', 'es', 'Español'], de: ['DE', 'de', 'Deutsch'],
    ru: ['RU', 'ru', 'Русский'], uk: ['UA', 'ua', 'Українська'], ko: ['KO', 'kr', '한국어'], ja: ['JA', 'jp', '日本語'],
  };
  const STORE = 'lp-lang';

  // English UI string -> [pt, es, de, ru, uk, ko, ja]
  const DICT = {
    'Live data, 24/7': ['Dados ao vivo, 24/7', 'Datos en vivo, 24/7', 'Live-Daten, 24/7', 'Данные в реальном времени, 24/7', 'Дані в реальному часі, 24/7', '실시간 데이터, 24/7', 'リアルタイムデータ、24時間365日'],
    "Monthly views, comment volume, estimated earnings, and an AI read on why it's trending.": ['Visualizações mensais, volume de comentários, ganhos estimados e uma análise de IA sobre por que está em alta.', 'Vistas mensuales, volumen de comentarios, ganancias estimadas y un análisis con IA de por qué es tendencia.', 'Monatliche Aufrufe, Kommentarvolumen, geschätzte Einnahmen und eine KI-Analyse, warum der Kanal im Trend liegt.', 'Просмотры за месяц, количество комментариев, оценка доходов и ИИ-анализ того, почему канал в тренде.', 'Перегляди за місяць, кількість коментарів, оцінка доходів та ШІ-аналіз того, чому канал у тренді.', '월간 조회수, 댓글 수, 예상 수익, 그리고 인기 이유에 대한 AI 분석.', '月間再生回数、コメント数、推定収益、そして話題の理由をAIが分析。'],
    'Single': ['Individual', 'Individual', 'Einzeln', 'Один', 'Один', '단일', '単体'],
    'Versus': ['Versus', 'Versus', 'Versus', 'Сравнение', 'Порівняння', '비교', '比較'],
    'Search': ['Pesquisar', 'Buscar', 'Suchen', 'Найти', 'Знайти', '검색', '検索'],
    'Compare': ['Comparar', 'Comparar', 'Vergleichen', 'Сравнить', 'Порівняти', '비교하기', '比較する'],
    'MrBeast, @handle, or channel URL': ['MrBeast, @handle ou URL do canal', 'MrBeast, @handle o URL del canal', 'MrBeast, @Handle oder Kanal-URL', 'MrBeast, @handle или ссылка на канал', 'MrBeast, @handle або посилання на канал', 'MrBeast, @핸들 또는 채널 URL', 'MrBeast、@ハンドル、またはチャンネルURL'],
    'Second channel': ['Segundo canal', 'Segundo canal', 'Zweiter Kanal', 'Второй канал', 'Другий канал', '두 번째 채널', '2つ目のチャンネル'],
    'Channel': ['Canal', 'Canal', 'Kanal', 'Канал', 'Канал', '채널', 'チャンネル'],
    'Mode': ['Modo', 'Modo', 'Modus', 'Режим', 'Режим', '모드', 'モード'],
    'Tracked channels': ['Canais monitorados', 'Canales seguidos', 'Beobachtete Kanäle', 'Отслеживаемые каналы', 'Відстежувані канали', '추적 중인 채널', '追跡中のチャンネル'],
    'Language': ['Idioma', 'Idioma', 'Sprache', 'Язык', 'Мова', '언어', '言語'],
    'Est. watching': ['Est. assistindo', 'Est. viendo', 'Gesch. Zuschauer', 'Оценка: смотрят', 'Оцінка: дивляться', '추정 시청자', '推定視聴者'],
    'Estimated number of people watching YouTube right now, by country': ['Número estimado de pessoas assistindo ao YouTube agora, por país', 'Número estimado de personas viendo YouTube ahora, por país', 'Geschätzte Zahl der Menschen, die gerade YouTube schauen, nach Land', 'Оценка числа людей, смотрящих YouTube прямо сейчас, по странам', 'Оцінка кількості людей, які дивляться YouTube просто зараз, за країнами', '현재 YouTube를 시청 중인 추정 인원, 국가별', '現在YouTubeを視聴している推定人数（国別）'],
    "Estimated number of people watching YouTube at the same moment in each country (not monthly users). Modelled from approximate YouTube users per country and the typical share watching at that local time of day, not measured. User counts per country: Google's YouTube ad-reach figures, late 2025 (via DataReportal). Recalculated at 03:00 and 15:00 UTC, the two daily peaks in viewing across these countries.": [
      'Número estimado de pessoas assistindo ao YouTube ao mesmo tempo em cada país (não usuários mensais). Modelado a partir do número aproximado de usuários do YouTube por país e da parcela típica que assiste naquele horário local, não medido. Usuários por país: alcance publicitário do YouTube informado pelo Google, final de 2025 (via DataReportal). Recalculado às 03:00 e 15:00 UTC, os dois picos diários de audiência nesses países.',
      'Número estimado de personas viendo YouTube al mismo tiempo en cada país (no usuarios mensuales). Modelado a partir del número aproximado de usuarios de YouTube por país y la proporción típica que mira a esa hora local, no medido. Usuarios por país: alcance publicitario de YouTube según Google, finales de 2025 (vía DataReportal). Se recalcula a las 03:00 y 15:00 UTC, los dos picos diarios de audiencia en estos países.',
      'Geschätzte Zahl der Menschen, die in jedem Land gleichzeitig YouTube schauen (keine monatlichen Nutzer). Modelliert aus der ungefähren Zahl der YouTube-Nutzer pro Land und dem typischen Anteil, der zu dieser Tageszeit zuschaut – nicht gemessen. Nutzer pro Land: Googles YouTube-Werbereichweite, Ende 2025 (über DataReportal). Neu berechnet um 03:00 und 15:00 UTC, den beiden täglichen Nutzungsspitzen in diesen Ländern.',
      'Оценка числа людей, одновременно смотрящих YouTube в каждой стране (не месячные пользователи). Модель на основе примерного числа пользователей YouTube в стране и типичной доли зрителей в это время суток, а не измерение. Пользователи по странам: рекламный охват YouTube по данным Google, конец 2025 года (через DataReportal). Пересчитывается в 03:00 и 15:00 UTC — в два ежедневных пика просмотров в этих странах.',
      'Оцінка кількості людей, які одночасно дивляться YouTube у кожній країні (не місячні користувачі). Модель на основі приблизної кількості користувачів YouTube у країні та типової частки глядачів у цей час доби, а не вимірювання. Користувачі за країнами: рекламне охоплення YouTube за даними Google, кінець 2025 року (через DataReportal). Перераховується о 03:00 та 15:00 UTC — у два щоденні піки переглядів у цих країнах.',
      '각 국가에서 동시에 YouTube를 시청하는 추정 인원입니다(월간 사용자 아님). 국가별 대략적인 YouTube 사용자 수와 현지 시간대별 일반적인 시청 비율로 모델링한 값이며, 실측치가 아닙니다. 국가별 사용자 수: Google의 YouTube 광고 도달 수치, 2025년 말 기준(DataReportal 경유). 이 국가들의 하루 두 번 시청 피크인 03:00 및 15:00 UTC에 다시 계산됩니다.',
      '各国で同時にYouTubeを視聴している推定人数です（月間ユーザー数ではありません）。国別のおおよそのYouTubeユーザー数と、その時間帯に視聴している一般的な割合から推計したもので、実測値ではありません。国別ユーザー数：GoogleによるYouTube広告リーチ、2025年末時点（DataReportal経由）。これらの国の1日2回の視聴ピークである03:00と15:00 UTCに再計算されます。'],
    'Searching database…': ['Pesquisando no banco de dados…', 'Buscando en la base de datos…', 'Datenbank wird durchsucht…', 'Поиск в базе данных…', 'Пошук у базі даних…', '데이터베이스 검색 중…', 'データベースを検索中…'],
    'Refreshing live metrics…': ['Atualizando métricas ao vivo…', 'Actualizando métricas en vivo…', 'Live-Kennzahlen werden aktualisiert…', 'Обновление данных в реальном времени…', 'Оновлення даних у реальному часі…', '실시간 지표 새로고침 중…', 'リアルタイム指標を更新中…'],
    'Fetching live data from YouTube…': ['Buscando dados ao vivo do YouTube…', 'Obteniendo datos en vivo de YouTube…', 'Live-Daten werden von YouTube abgerufen…', 'Получение данных с YouTube…', 'Отримання даних з YouTube…', 'YouTube에서 실시간 데이터 가져오는 중…', 'YouTubeからリアルタイムデータを取得中…'],
    'Loading from database…': ['Carregando do banco de dados…', 'Cargando desde la base de datos…', 'Wird aus der Datenbank geladen…', 'Загрузка из базы данных…', 'Завантаження з бази даних…', '데이터베이스에서 불러오는 중…', 'データベースから読み込み中…'],
    'Monthly views': ['Visualizações mensais', 'Vistas mensuales', 'Monatliche Aufrufe', 'Просмотры за месяц', 'Перегляди за місяць', '월간 조회수', '月間再生回数'],
    'LEADS': ['LIDERA', 'LIDERA', 'VORNE', 'ЛИДЕР', 'ЛІДЕР', '우세', 'リード'],
    'Uploads, last 30 days': ['Vídeos dos últimos 30 dias', 'Videos de los últimos 30 días', 'Uploads der letzten 30 Tage', 'Видео за последние 30 дней', 'Відео за останні 30 днів', '최근 30일 업로드', '過去30日の投稿'],
    'Comments': ['Comentários', 'Comentarios', 'Kommentare', 'Комментарии', 'Коментарі', '댓글', 'コメント'],
    'Last 30 days': ['Últimos 30 dias', 'Últimos 30 días', 'Letzte 30 Tage', 'Последние 30 дней', 'Останні 30 днів', '최근 30일', '過去30日'],
    'Est. earnings': ['Ganhos est.', 'Ganancias est.', 'Gesch. Einnahmen', 'Оценка дохода', 'Оцінка доходу', '예상 수익', '推定収益'],
    'Per month, USD': ['Por mês, USD', 'Por mes, USD', 'Pro Monat, USD', 'В месяц, USD', 'На місяць, USD', '월간, USD', '月あたり、USD'],
    'AI executive summary': ['Resumo executivo por IA', 'Resumen ejecutivo con IA', 'KI-Zusammenfassung', 'ИИ-сводка', 'ШІ-підсумок', 'AI 요약', 'AIサマリー'],
    'AI summary unavailable for this snapshot.': ['Resumo de IA indisponível para este registro.', 'Resumen de IA no disponible para este registro.', 'KI-Zusammenfassung für diesen Stand nicht verfügbar.', 'ИИ-сводка для этого снимка недоступна.', 'ШІ-підсумок для цього знімка недоступний.', '이 스냅샷에 대한 AI 요약을 사용할 수 없습니다.', 'このスナップショットのAIサマリーはありません。'],
    'Unknown error': ['Erro desconhecido', 'Error desconocido', 'Unbekannter Fehler', 'Неизвестная ошибка', 'Невідома помилка', '알 수 없는 오류', '不明なエラー'],
    'Like Polling · Data via YouTube Data API · Summaries by Gemini · Earnings are estimates ($1–$4 per 1K views)': ['Like Polling · Dados via YouTube Data API · Resumos por Gemini · Ganhos são estimativas (US$1–US$4 por mil visualizações)', 'Like Polling · Datos vía YouTube Data API · Resúmenes por Gemini · Las ganancias son estimaciones (US$1–US$4 por cada mil vistas)', 'Like Polling · Daten über die YouTube Data API · Zusammenfassungen von Gemini · Einnahmen sind Schätzungen (1–4 $ pro 1.000 Aufrufe)', 'Like Polling · Данные через YouTube Data API · Сводки от Gemini · Доходы — оценка ($1–$4 за 1 тыс. просмотров)', 'Like Polling · Дані через YouTube Data API · Підсумки від Gemini · Доходи — оцінка ($1–$4 за 1 тис. переглядів)', 'Like Polling · 데이터: YouTube Data API · 요약: Gemini · 수익은 추정치입니다(조회수 1천 회당 $1–$4)', 'Like Polling · データ：YouTube Data API · 要約：Gemini · 収益は推定値です（1,000回再生あたり$1〜$4）'],
    // Trending Index + Music Index
    'Trending Index': ['Índice de Tendências', 'Índice de Tendencias', 'Trend-Index', 'Индекс трендов', 'Індекс трендів', '트렌딩 지수', 'トレンド指数'],
    'Music Index': ['Índice Musical', 'Índice Musical', 'Musik-Index', 'Музыкальный индекс', 'Музичний індекс', '음악 지수', '音楽指数'],
    'Video': ['Vídeo', 'Video', 'Video', 'Видео', 'Відео', '동영상', '動画'],
    'Track': ['Faixa', 'Canción', 'Titel', 'Трек', 'Трек', '곡', '曲'],
    'Views': ['Visualizações', 'Vistas', 'Aufrufe', 'Просмотры', 'Перегляди', '조회수', '再生回数'],
    'Likes': ['Curtidas', 'Me gusta', 'Likes', 'Лайки', 'Лайки', '좋아요', '高評価'],
    'Country': ['País', 'País', 'Land', 'Страна', 'Країна', '국가', '国'],
    'YouTube trending videos by country': ['Vídeos em alta no YouTube por país', 'Videos en tendencia de YouTube por país', 'YouTube-Trendvideos nach Land', 'Трендовые видео YouTube по странам', 'Трендові відео YouTube за країнами', '국가별 YouTube 인기 동영상', '国別のYouTube急上昇動画'],
    'YouTube trending music by country': ['Músicas em alta no YouTube por país', 'Música en tendencia de YouTube por país', 'YouTube-Trendmusik nach Land', 'Трендовая музыка YouTube по странам', 'Трендова музика YouTube за країнами', '국가별 YouTube 인기 음악', '国別のYouTube急上昇音楽'],
    "YouTube's own Trending chart for each country, via the YouTube Data API. Refreshed hourly.": ['Ranking oficial Em Alta do YouTube em cada país, via YouTube Data API. Atualizado a cada hora.', 'Ranking oficial de Tendencias de YouTube en cada país, vía YouTube Data API. Se actualiza cada hora.', 'YouTubes eigene Trend-Charts für jedes Land, über die YouTube Data API. Stündlich aktualisiert.', 'Официальный чарт трендов YouTube для каждой страны через YouTube Data API. Обновляется каждый час.', 'Офіційний чарт трендів YouTube для кожної країни через YouTube Data API. Оновлюється щогодини.', '국가별 YouTube 공식 인기 차트, YouTube Data API 제공. 매시간 업데이트.', '各国のYouTube公式急上昇チャート（YouTube Data API経由）。1時間ごとに更新。'],
    "YouTube's own Trending chart for Music in each country, via the YouTube Data API. Refreshed hourly.": ['Ranking oficial Em Alta de Música do YouTube em cada país, via YouTube Data API. Atualizado a cada hora.', 'Ranking oficial de Tendencias de Música de YouTube en cada país, vía YouTube Data API. Se actualiza cada hora.', 'YouTubes eigene Musik-Trend-Charts für jedes Land, über die YouTube Data API. Stündlich aktualisiert.', 'Официальный музыкальный чарт трендов YouTube для каждой страны через YouTube Data API. Обновляется каждый час.', 'Офіційний музичний чарт трендів YouTube для кожної країни через YouTube Data API. Оновлюється щогодини.', '국가별 YouTube 공식 인기 음악 차트, YouTube Data API 제공. 매시간 업데이트.', '各国のYouTube公式音楽急上昇チャート（YouTube Data API経由）。1時間ごとに更新。'],
    'No trending data for this country yet.': ['Ainda não há dados de tendências para este país.', 'Aún no hay datos de tendencias para este país.', 'Für dieses Land gibt es noch keine Trenddaten.', 'Для этой страны пока нет данных о трендах.', 'Для цієї країни ще немає даних про тренди.', '이 국가의 인기 데이터가 아직 없습니다.', 'この国の急上昇データはまだありません。'],
    'Trending data is unavailable right now.': ['Os dados de tendências estão indisponíveis no momento.', 'Los datos de tendencias no están disponibles en este momento.', 'Trenddaten sind gerade nicht verfügbar.', 'Данные о трендах сейчас недоступны.', 'Дані про тренди зараз недоступні.', '지금은 인기 데이터를 사용할 수 없습니다.', '現在、急上昇データを利用できません。'],
    // Creator News Wire
    'Creator News Wire': ['Notícias de Criadores', 'Noticias de Creadores', 'Creator-Newsticker', 'Новости авторов', 'Новини авторів', '크리에이터 뉴스', 'クリエイターニュース'],
    'YouTube and creator news': ['Notícias do YouTube e de criadores', 'Noticias de YouTube y creadores', 'Nachrichten zu YouTube und Creators', 'Новости YouTube и авторов', 'Новини YouTube та авторів', 'YouTube 및 크리에이터 뉴스', 'YouTubeとクリエイターのニュース'],
    'All news': ['Todas', 'Todas', 'Alle', 'Все', 'Усі', '전체', 'すべて'],
    'YouTube updates': ['Novidades do YouTube', 'Novedades de YouTube', 'YouTube-News', 'Новости YouTube', 'Новини YouTube', 'YouTube 소식', 'YouTubeの最新情報'],
    'Creator economy': ['Economia dos criadores', 'Economía de creadores', 'Creator Economy', 'Экономика авторов', 'Економіка авторів', '크리에이터 경제', 'クリエイター経済'],
    'News filter': ['Filtro de notícias', 'Filtro de noticias', 'Nachrichtenfilter', 'Фильтр новостей', 'Фільтр новин', '뉴스 필터', 'ニュースフィルター'],
    'Creators': ['Criadores', 'Creadores', 'Creators', 'Авторы', 'Автори', '크리에이터', 'クリエイター'],
    'No headlines in this filter yet.': ['Ainda não há manchetes neste filtro.', 'Aún no hay titulares en este filtro.', 'In diesem Filter gibt es noch keine Schlagzeilen.', 'В этом фильтре пока нет заголовков.', 'У цьому фільтрі ще немає заголовків.', '이 필터에는 아직 헤드라인이 없습니다.', 'このフィルターにはまだ見出しがありません。'],
    'News is unavailable right now.': ['As notícias estão indisponíveis no momento.', 'Las noticias no están disponibles en este momento.', 'Nachrichten sind gerade nicht verfügbar.', 'Новости сейчас недоступны.', 'Новини зараз недоступні.', '지금은 뉴스를 사용할 수 없습니다.', '現在、ニュースを利用できません。'],
    'Latest headlines from Google News in the selected language. Refreshed hourly.': ['Manchetes mais recentes do Google News no idioma selecionado. Atualizado a cada hora.', 'Titulares más recientes de Google News en el idioma seleccionado. Se actualiza cada hora.', 'Aktuelle Schlagzeilen von Google News in der gewählten Sprache. Stündlich aktualisiert.', 'Свежие заголовки Google News на выбранном языке. Обновляется каждый час.', 'Свіжі заголовки Google News обраною мовою. Оновлюється щогодини.', '선택한 언어의 Google News 최신 헤드라인. 매시간 업데이트.', '選択した言語のGoogle News最新見出し。1時間ごとに更新。'],
  };
  // Exact text nodes, whitespace included (the headline wraps "YouTube" in <em>;
  // the ticker label puts " YouTube" in its own span).
  const RAW = {
    'Search any ': ['Pesquise qualquer canal do ', 'Busca cualquier canal de ', 'Durchsuche jeden ', 'Найдите любой канал на ', 'Знайдіть будь-який канал на ', '', ''],
    ' channel.': ['.', '.', '-Kanal.', '.', '.', ' 채널을 검색하세요.', 'チャンネルを検索。'],
    ' YouTube': [' YouTube', ' YouTube', ' auf YouTube', ' YouTube', ' YouTube', ' (YouTube)', ' (YouTube)'],
  };
  const PATTERNS = [
    [/^As of (\d\d:\d\d) UTC$/, ['Às $1 UTC', 'A las $1 UTC', 'Stand $1 UTC', 'На $1 UTC', 'Станом на $1 UTC', '$1 UTC 기준', '$1 UTC時点']],
    [/^Updated (.+)$/, ['Atualizado: $1', 'Actualizado: $1', 'Aktualisiert: $1', 'Обновлено: $1', 'Оновлено: $1', '업데이트: $1', '更新：$1'], localDate],
    [/^Couldn't load "([\s\S]*)"$/, ['Não foi possível carregar "$1"', 'No se pudo cargar "$1"', '„$1“ konnte nicht geladen werden', 'Не удалось загрузить «$1»', 'Не вдалося завантажити «$1»', '"$1"을(를) 불러올 수 없습니다', '「$1」を読み込めませんでした']],
    [/^Showing cached data — live refresh failed \(([\s\S]*)\)\.$/, ['Mostrando dados em cache — a atualização ao vivo falhou ($1).', 'Mostrando datos en caché — la actualización en vivo falló ($1).', 'Zwischengespeicherte Daten – Live-Aktualisierung fehlgeschlagen ($1).', 'Показаны сохранённые данные — обновление не удалось ($1).', 'Показано збережені дані — оновлення не вдалося ($1).', '캐시된 데이터 표시 중 — 실시간 새로고침 실패 ($1).', 'キャッシュされたデータを表示中 — 更新に失敗しました（$1）。']],
    [/^Gemini summary failed: ([\s\S]*)$/, ['Falha no resumo do Gemini: $1', 'Falló el resumen de Gemini: $1', 'Gemini-Zusammenfassung fehlgeschlagen: $1', 'Ошибка сводки Gemini: $1', 'Помилка підсумку Gemini: $1', 'Gemini 요약 실패: $1', 'Geminiの要約に失敗しました：$1']],
    [/^Database lookup failed: ([\s\S]*)$/, ['Falha na consulta ao banco de dados: $1', 'Falló la consulta a la base de datos: $1', 'Datenbankabfrage fehlgeschlagen: $1', 'Ошибка запроса к базе данных: $1', 'Помилка запиту до бази даних: $1', '데이터베이스 조회 실패: $1', 'データベースの検索に失敗しました：$1']],
    [/^Metrics lookup failed: ([\s\S]*)$/, ['Falha na consulta de métricas: $1', 'Falló la consulta de métricas: $1', 'Abruf der Kennzahlen fehlgeschlagen: $1', 'Ошибка получения метрик: $1', 'Помилка отримання метрик: $1', '지표 조회 실패: $1', '指標の取得に失敗しました：$1']],
  ];
  // European Portuguese wording where it differs from the Brazilian 'pt' column (keyed by English text or pattern source).
  const PT_PT = {
    'Live data, 24/7': 'Dados em direto, 24/7',
    "Monthly views, comment volume, estimated earnings, and an AI read on why it's trending.": 'Visualizações mensais, volume de comentários, ganhos estimados e uma análise de IA sobre o motivo de estar em tendência.',
    'Tracked channels': 'Canais monitorizados',
    'Est. watching': 'Est. a ver',
    'Estimated number of people watching YouTube right now, by country': 'Número estimado de pessoas a ver YouTube neste momento, por país',
    "Estimated number of people watching YouTube at the same moment in each country (not monthly users). Modelled from approximate YouTube users per country and the typical share watching at that local time of day, not measured. User counts per country: Google's YouTube ad-reach figures, late 2025 (via DataReportal). Recalculated at 03:00 and 15:00 UTC, the two daily peaks in viewing across these countries.": 'Número estimado de pessoas a ver YouTube ao mesmo tempo em cada país (não utilizadores mensais). Modelado a partir do número aproximado de utilizadores do YouTube por país e da parcela típica que vê àquela hora local, não medido. Utilizadores por país: alcance publicitário do YouTube indicado pela Google, final de 2025 (via DataReportal). Recalculado às 03:00 e às 15:00 UTC, os dois picos diários de audiência nestes países.',
    'Searching database…': 'A pesquisar na base de dados…',
    'Refreshing live metrics…': 'A atualizar métricas em direto…',
    'Fetching live data from YouTube…': 'A obter dados em direto do YouTube…',
    'Loading from database…': 'A carregar a partir da base de dados…',
    'AI summary unavailable for this snapshot.': 'Resumo de IA indisponível para este registo.',
    'Like Polling · Data via YouTube Data API · Summaries by Gemini · Earnings are estimates ($1–$4 per 1K views)': 'Like Polling · Dados via YouTube Data API · Resumos por Gemini · Os ganhos são estimativas (1–4 US$ por mil visualizações)',
    'Likes': 'Gostos',
    'YouTube trending videos by country': 'Vídeos em tendência no YouTube por país',
    'YouTube trending music by country': 'Músicas em tendência no YouTube por país',
    "YouTube's own Trending chart for each country, via the YouTube Data API. Refreshed hourly.": 'Tabela oficial de Tendências do YouTube em cada país, via YouTube Data API. Atualizada de hora a hora.',
    "YouTube's own Trending chart for Music in each country, via the YouTube Data API. Refreshed hourly.": 'Tabela oficial de Tendências de Música do YouTube em cada país, via YouTube Data API. Atualizada de hora a hora.',
    'Trending data is unavailable right now.': 'Os dados de tendências estão indisponíveis de momento.',
    'No headlines in this filter yet.': 'Ainda não há títulos neste filtro.',
    'News is unavailable right now.': 'As notícias estão indisponíveis de momento.',
    'Latest headlines from Google News in the selected language. Refreshed hourly.': 'Últimos títulos do Google News no idioma selecionado. Atualizado de hora a hora.',
    [/^Showing cached data — live refresh failed \(([\s\S]*)\)\.$/.source]: 'A mostrar dados em cache — a atualização em direto falhou ($1).',
    [/^Database lookup failed: ([\s\S]*)$/.source]: 'Falha na consulta à base de dados: $1',
  };
  // Narrower wording inside a container: [selector, { English: [pt, es, de, ru, uk, ko, ja] }]
  const CONTEXT = [
    ['.ytt', { 'Views': ['Visualiz.', 'Vistas', 'Aufrufe', 'Просм.', 'Перегл.', '조회수', '再生数'] }],
  ];
  const TITLES = {
    'Like Polling | YouTube Channel Intelligence': ['Like Polling | Inteligência de canais do YouTube', 'Like Polling | Inteligencia de canales de YouTube', 'Like Polling | YouTube-Kanalanalyse', 'Like Polling | Аналитика YouTube-каналов', 'Like Polling | Аналітика YouTube-каналів', 'Like Polling | YouTube 채널 인텔리전스', 'Like Polling | YouTubeチャンネル分析'],
  };
  const ATTRS = ['placeholder', 'aria-label', 'title'];
  const idx = (l) => COLS.indexOf(l === 'pt-PT' ? 'pt' : l);
  const col = (row, key, l) => (l === 'pt-PT' && PT_PT[key] != null ? PT_PT[key] : row[idx(l)]);
  const locale = (l) => (l === 'pt' ? 'pt-BR' : l);
  function localDate(s, lang) {
    const d = Date.parse(s);
    return Number.isNaN(d) ? s : new Date(d).toLocaleString(locale(lang), { dateStyle: 'medium', timeStyle: 'short' });
  }

  // English country names (as stored in Supabase) -> ISO code, for Intl.DisplayNames.
  const countryCode = {};
  try {
    const en = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = en.of(code);
      if (name && name !== code) countryCode[name] = code;
    }
    Object.assign(countryCode, { Turkey: 'TR', 'Türkiye': 'TR', 'South Korea': 'KR', Russia: 'RU', Vietnam: 'VN', 'Czech Republic': 'CZ' });
  } catch (e) { /* older browsers: country names stay in English */ }
  const regionNames = {};
  function country(name, lang) {
    const code = countryCode[name];
    if (!code) return null;
    try { return (regionNames[lang] ||= new Intl.DisplayNames([locale(lang)], { type: 'region' })).of(code); } catch (e) { return null; }
  }

  function translate(en, lang, el) {
    if (lang === 'en' || !en) return null;
    if (el) for (const [sel, map] of CONTEXT) if (map[en.trim()] && el.closest(sel)) return en.replace(en.trim(), col(map[en.trim()], en.trim(), lang));
    if (RAW[en]) return col(RAW[en], en, lang);
    const core = en.trim();
    if (!core) return null;
    const lead = en.slice(0, en.indexOf(core)), trail = en.slice(en.indexOf(core) + core.length);
    let out = DICT[core] ? col(DICT[core], core, lang) : null;
    if (out == null) for (const [re, t, fn] of PATTERNS) {
      const m = core.match(re);
      if (m) { out = col(t, re.source, lang).replace('$1', () => (fn ? fn(m[1], lang) : m[1])); break; }
    }
    if (out == null) { const m = core.match(/^(.+?)(:?)$/); const c = m && country(m[1], lang); if (c) out = c + m[2]; }
    return out == null ? null : lead + out + trail;
  }
  function t(en) { return translate(en, lang) ?? en; }

  let stored = null;
  try { stored = localStorage.getItem(STORE); } catch (e) { /* storage blocked */ }
  const nav = (navigator.language || '').toLowerCase();
  const browser = nav === 'pt-pt' ? 'pt-PT' : nav.slice(0, 2);
  let lang = LANGS.includes(stored) ? stored : LANGS.includes(browser) ? browser : 'en';

  const textEn = new WeakMap(), textOut = new WeakMap();
  const attrEn = new WeakMap();
  const skip = (el) => !el || el.closest('script, style, [data-no-i18n]');

  function doText(n) {
    if (skip(n.parentElement)) return;
    let en = textEn.get(n);
    if (en === undefined || n.data !== textOut.get(n)) { en = n.data; textEn.set(n, en); }
    const out = translate(en, lang, n.parentElement) ?? en;
    if (n.data !== out) n.data = out;
    textOut.set(n, out);
  }
  function doAttrs(el) {
    if (skip(el)) return;
    let rec = attrEn.get(el);
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      rec ||= {};
      if (!rec[a] || cur !== rec[a].out) rec[a] = { en: cur };
      const out = translate(rec[a].en, lang) ?? rec[a].en;
      if (cur !== out) el.setAttribute(a, out);
      rec[a].out = out;
    }
    if (rec) attrEn.set(el, rec);
  }
  function walk(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1) return;
    doAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) (n.nodeType === 3 ? doText : doAttrs)(n);
  }

  const titleEn = document.title;
  function apply() {
    observer.disconnect();
    walk(document.body);
    document.title = (TITLES[titleEn] && lang !== 'en') ? col(TITLES[titleEn], titleEn, lang) : titleEn;
    document.documentElement.lang = locale(lang);
    switcher.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    observe();
  }

  const observer = new MutationObserver((records) => {
    observer.disconnect();
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach(walk);
      else if (r.type === 'characterData') doText(r.target);
      else if (r.type === 'attributes') doAttrs(r.target);
    }
    observe();
  });
  function observe() {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  const style = document.createElement('style');
  style.textContent = `
    .lp-lang { display: inline-flex; flex-wrap: nowrap; margin: 0 10px 0 auto; padding: 3px; border-radius: 999px; background: #f4f4f4; }
    .lp-lang button { display: inline-flex; align-items: center; gap: 5px; border: 0; background: transparent; padding: 4px 8px; border-radius: 999px; cursor: pointer; font: inherit; font-size: 11px; font-weight: 600; letter-spacing: .08em; color: var(--muted, #737373); transition: color .15s, background .15s; }
    .lp-lang img { width: 16px; height: 12px; border-radius: 2px; object-fit: cover; box-shadow: 0 0 0 1px rgba(0,0,0,.08); opacity: .85; transition: opacity .15s; }
    .lp-lang button:hover { color: var(--red, #b0000e); }
    .lp-lang button:hover img, .lp-lang button[aria-pressed="true"] img { opacity: 1; }
    .lp-lang button[aria-pressed="true"] { background: #fff; color: var(--red, #b0000e); box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 1px rgba(0,0,0,.04); }
    .lp-lang button:focus-visible { outline: 2px solid var(--red, #b0000e); outline-offset: 1px; }
    html[lang="es"] .ymu th { white-space: nowrap; }
    @media (max-width: 1100px) { .lp-lang span { display: none; } .lp-lang button { padding: 5px 7px; } }
    @media (max-width: 520px) {
      header.top:has(> .lp-lang) { flex-wrap: wrap; row-gap: 12px; }
      header.top > .brand, header.top > .live { white-space: nowrap; }
      .lp-lang { order: 3; margin: 0 0 0 auto; }
    }`;
  document.head.appendChild(style);

  const switcher = document.createElement('div');
  switcher.className = 'lp-lang';
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', 'Language');
  switcher.innerHTML = LANGS.map((l) => `<button type="button" data-lang="${l}" data-no-i18n lang="${locale(l)}" aria-label="${META[l][2]}" title="${META[l][2]}"><img src="/assets/flags/${META[l][1]}.svg" alt="" width="16" height="12"><span>${META[l][0]}</span></button>`).join('');
  switcher.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-lang]');
    if (b && b.dataset.lang !== lang) setLang(b.dataset.lang);
  });
  const header = document.querySelector('header.top');
  if (header) header.insertBefore(switcher, header.querySelector('.live'));

  function setLang(l) {
    if (!LANGS.includes(l)) return;
    lang = l;
    try { localStorage.setItem(STORE, l); } catch (e) { /* storage blocked */ }
    apply();
    document.dispatchEvent(new CustomEvent('lp:lang', { detail: { lang } }));
  }

  window.LP_I18N = { get lang() { return lang; }, setLang, t };
  apply();
})();
