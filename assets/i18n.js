// Site language switcher (EN | BR | PT | ES | DE | RU | UA | KO | JA). Load right after the page markup:
//   <script src="/assets/i18n.js"></script>
// Translates the page's English UI text in place, including text that scripts
// and widgets render later (watched with a MutationObserver), so existing code
// needs no changes. YouTube titles, channel names, AI summaries and anything
// inside [data-no-i18n] are left as they are. The choice is kept in localStorage
// and announced with a "lp:lang" event ({ detail: { lang } }) on document.
(function () {
  'use strict';
  const LANGS = ['en', 'en-GB', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja'];
  // Dictionary columns. European Portuguese ('pt-PT') uses the 'pt' column plus the PT_PT overrides below.
  const COLS = ['pt', 'es', 'de', 'ru', 'uk', 'ko', 'ja'];
  // Button label, flag (assets/flags) and native name. Ukrainian shows "UA" so it isn't read as United Kingdom.
  const META = {
    en: ['EN', 'us', 'English'], 'en-GB': ['UK', 'gb', 'English (UK)'], pt: ['BR', 'br', 'Português (Brasil)'], 'pt-PT': ['PT', 'pt', 'Português (Portugal)'], es: ['ES', 'es', 'Español'], de: ['DE', 'de', 'Deutsch'],
    ru: ['RU', 'ru', 'Русский'], uk: ['UA', 'ua', 'Українська'], ko: ['KO', 'kr', '한국어'], ja: ['JA', 'jp', '日本語'],
  };
  const STORE = 'lp-lang';

  // English UI string -> [pt, es, de, ru, uk, ko, ja]
  const DICT = {
    "Top story": ["Destaque", "Destacado", "Top-Story", "Главное", "Головне", "톱 뉴스", "トップ記事"],
    "Creator wire": ["Notícia de criadores", "Noticia de creadores", "Creator-News", "Новости авторов", "Новини авторів", "크리에이터 소식", "クリエイター速報"],
    "Read story": ["Ler matéria", "Leer noticia", "Artikel lesen", "Читать", "Читати", "기사 읽기", "記事を読む"],
    "Open source": ["Abrir fonte", "Abrir fuente", "Quelle öffnen", "Открыть источник", "Відкрити джерело", "출처 열기", "元記事を開く"],
    "Search channel": ["Buscar canal", "Buscar canal", "Kanal suchen", "Найти канал", "Знайти канал", "채널 검색", "チャンネルを検索"],
    "Pause motion": ["Pausar animação", "Pausar animación", "Animation pausieren", "Остановить анимацию", "Зупинити анімацію", "애니메이션 일시정지", "アニメーションを一時停止"],
    "Play motion": ["Retomar animação", "Reanudar animación", "Animation fortsetzen", "Возобновить анимацию", "Відновити анімацію", "애니메이션 재생", "アニメーションを再開"],
    "More stories": ["Mais notícias", "Más noticias", "Weitere Meldungen", "Ещё новости", "Більше новин", "더 많은 소식", "その他の記事"],
    "From other languages": ["De outros idiomas", "De otros idiomas", "Aus anderen Sprachen", "На других языках", "Іншими мовами", "다른 언어 소식", "他の言語の記事"],
    "Previous story": ["Notícia anterior", "Noticia anterior", "Vorherige Meldung", "Предыдущая новость", "Попередня новина", "이전 소식", "前の記事"],
    "Popular Shorts by country": ["Shorts populares por país", "Shorts populares por país", "Beliebte Shorts nach Land", "Популярные Shorts по странам", "Популярні Shorts за країнами", "국가별 인기 Shorts", "国別の人気ショート"],
    "No Popular Shorts for this country right now.": ["Nenhum Short popular para este país no momento.", "No hay Shorts populares para este país por ahora.", "Derzeit keine beliebten Shorts für dieses Land.", "Сейчас для этой страны нет популярных Shorts.", "Зараз для цієї країни немає популярних Shorts.", "현재 이 국가의 인기 Shorts가 없습니다.", "現在この国の人気ショートはありません。"],
    "You've seen all Popular Shorts for this country.": ["Você viu todos os Shorts populares deste país.", "Ya viste todos los Shorts populares de este país.", "Du hast alle beliebten Shorts dieses Landes gesehen.", "Вы посмотрели все популярные Shorts этой страны.", "Ви переглянули всі популярні Shorts цієї країни.", "이 국가의 인기 Shorts를 모두 봤습니다.", "この国の人気ショートはすべて見ました。"],
    "Use your arrow keys to browse": ["Use as setas do teclado para navegar", "Usa las flechas del teclado para navegar", "Mit den Pfeiltasten blättern", "Листайте клавишами со стрелками", "Гортайте клавішами зі стрілками", "방향키로 넘겨 보세요", "矢印キーで切り替え"],
    "Swipe up for the next Short": ["Deslize para cima para o próximo Short", "Desliza hacia arriba para el siguiente Short", "Nach oben wischen für den nächsten Short", "Смахните вверх для следующего Short", "Проведіть угору для наступного Short", "위로 스와이프하면 다음 Shorts", "上にスワイプで次のショート"],
    "World News Wire": ["Notícias do Mundo", "Noticias del Mundo", "Weltnachrichten", "Мировые новости", "Світові новини", "세계 뉴스", "世界のニュース"],
    "Top stories": ["Principais notícias", "Noticias destacadas", "Top-Meldungen", "Главные новости", "Головні новини", "주요 뉴스", "トップニュース"],
    "No top stories for this country right now.": ["Nenhuma notícia principal para este país no momento.", "No hay noticias destacadas para este país por ahora.", "Derzeit keine Top-Meldungen für dieses Land.", "Сейчас для этой страны нет главных новостей.", "Зараз для цієї країни немає головних новин.", "현재 이 국가의 주요 뉴스가 없습니다.", "現在この国のトップニュースはありません。"],
    "The chosen country's 10 top stories from Google News, ranked 1–10 in Google News' order, in the country's language. Only stories with the article's own photo are shown; when a country has fewer than 10, its most recent stories from other Google News sections fill the remaining places. Algeria, Ecuador and Iraq have no Google News edition, so they show Google News search results for the country's name. Refreshed twice a day (00:00 and 12:00 UTC).": ["As 10 principais notícias do Google News para o país escolhido, numeradas de 1 a 10 na ordem do Google News, no idioma do país. Só aparecem notícias com a foto do próprio artigo; quando um país tem menos de 10, as notícias mais recentes de outras seções do Google News completam as vagas. Argélia, Equador e Iraque não têm edição no Google News, então mostram resultados de busca do Google News pelo nome do país. Atualizado 2 vezes por dia (00:00 e 12:00 UTC).", "Las 10 noticias destacadas de Google News para el país elegido, numeradas del 1 al 10 en el orden de Google News, en el idioma del país. Solo se muestran noticias con la foto del propio artículo; cuando un país tiene menos de 10, las noticias más recientes de otras secciones de Google News completan los puestos restantes. Argelia, Ecuador e Irak no tienen edición de Google News, así que muestran resultados de búsqueda de Google News con el nombre del país. Se actualiza 2 veces al día (00:00 y 12:00 UTC).", "Die 10 Top-Meldungen aus Google News für das gewählte Land, von 1 bis 10 in der Reihenfolge von Google News, in der Landessprache. Es werden nur Meldungen mit dem eigenen Foto des Artikels gezeigt; hat ein Land weniger als 10, füllen die neuesten Meldungen aus anderen Google-News-Rubriken die restlichen Plätze. Algerien, Ecuador und der Irak haben keine eigene Google-News-Ausgabe und zeigen daher Google-News-Suchergebnisse zum Ländernamen. Zweimal täglich aktualisiert (00:00 und 12:00 UTC).", "10 главных новостей Google News для выбранной страны, пронумерованных от 1 до 10 в порядке Google News, на языке этой страны. Показываются только новости с собственным фото статьи; если у страны их меньше 10, оставшиеся места занимают самые свежие новости из других разделов Google News. У Алжира, Эквадора и Ирака нет своего выпуска Google News, поэтому для них показываются результаты поиска Google News по названию страны. Обновляется 2 раза в день (00:00 и 12:00 UTC).", "10 головних новин Google News для обраної країни, пронумерованих від 1 до 10 у порядку Google News, мовою цієї країни. Показуються лише новини з власним фото статті; якщо в країни їх менше 10, решту місць займають найсвіжіші новини з інших розділів Google News. Алжир, Еквадор та Ірак не мають власного випуску Google News, тому для них показуються результати пошуку Google News за назвою країни. Оновлюється 2 рази на день (00:00 і 12:00 UTC).", "선택한 국가의 Google 뉴스 주요 뉴스 10개를 Google 뉴스 순서대로 1~10위로 매겨 해당 국가의 언어로 보여줍니다. 기사 자체 사진이 있는 뉴스만 표시되며, 한 국가의 뉴스가 10개 미만이면 Google 뉴스 다른 섹션의 최신 뉴스로 나머지 자리를 채웁니다. 알제리, 에콰도르, 이라크는 Google 뉴스 판이 없어 국가 이름으로 검색한 Google 뉴스 결과를 보여줍니다. 하루 2번 업데이트됩니다(UTC 00:00, 12:00).", "選択した国の Google ニュースのトップニュース 10 件を、Google ニュースの順に 1〜10 位で、その国の言語で表示します。記事自体の写真があるニュースだけを表示し、10 件に満たない国では、Google ニュースの他のセクションの最新ニュースで残りを埋めます。アルジェリア、エクアドル、イラクには Google ニュースの版がないため、国名での Google ニュース検索結果を表示します。1 日 2 回更新（UTC 00:00、12:00）。"],
    "Top 10": ["Top 10", "Top 10", "Top 10", "Топ-10", "Топ-10", "TOP 10", "トップ10"],
    "Hover to preview · click to watch with sound": ["Passe o mouse para ver a prévia · clique para assistir com som", "Pasa el cursor para ver la vista previa · haz clic para verlo con sonido", "Zum Vorschauen darüberfahren · klicken für Ton", "Наведите для превью · нажмите, чтобы смотреть со звуком", "Наведіть для прев’ю · натисніть, щоб дивитися зі звуком", "마우스를 올리면 미리보기 · 클릭하면 소리와 함께 재생", "カーソルを合わせてプレビュー・クリックで音声付き再生"],
    "Tap to preview · tap again to watch with sound": ["Toque para ver a prévia · toque de novo para assistir com som", "Toca para ver la vista previa · toca otra vez para verlo con sonido", "Tippen für Vorschau · erneut tippen für Ton", "Нажмите для превью · нажмите ещё раз, чтобы смотреть со звуком", "Торкніться для прев’ю · торкніться ще раз, щоб дивитися зі звуком", "탭하면 미리보기 · 한 번 더 탭하면 소리와 함께 재생", "タップでプレビュー・もう一度タップで音声付き再生"],
    "Close": ["Fechar", "Cerrar", "Schließen", "Закрыть", "Закрити", "닫기", "閉じる"],
    "Previous video": ["Vídeo anterior", "Video anterior", "Vorheriges Video", "Предыдущее видео", "Попереднє відео", "이전 동영상", "前の動画"],
    "Next video": ["Próximo vídeo", "Siguiente video", "Nächstes Video", "Следующее видео", "Наступне відео", "다음 동영상", "次の動画"],
    "Headlines are translated into the site language by AI (Gemini); hover over a headline to see the original.": ["As manchetes são traduzidas para o idioma do site por IA (Gemini); passe o mouse sobre uma manchete para ver o original.", "Los titulares se traducen al idioma del sitio con IA (Gemini); pasa el cursor sobre un titular para ver el original.", "Schlagzeilen werden per KI (Gemini) in die Sprache der Website übersetzt; mit der Maus darauf zeigen, um das Original zu sehen.", "Заголовки переведены на язык сайта с помощью ИИ (Gemini); наведите на заголовок, чтобы увидеть оригинал.", "Заголовки перекладено мовою сайту за допомогою ШІ (Gemini); наведіть на заголовок, щоб побачити оригінал.", "헤드라인은 AI(Gemini)가 사이트 언어로 번역합니다. 헤드라인에 마우스를 올리면 원문이 보입니다.", "見出しはAI（Gemini）でサイトの言語に翻訳されています。見出しにカーソルを合わせると原文が表示されます。"],
    "Popular Shorts from": ["Shorts populares:", "Shorts populares:", "Beliebte Shorts:", "Популярные Shorts:", "Популярні Shorts:", "인기 Shorts 국가:", "人気ショートの国:"],
    "Popular Short": ["Short popular", "Short popular", "Beliebter Short", "Популярный Short", "Популярний Short", "인기 Shorts", "人気ショート"],
    "Play video": ["Reproduzir vídeo", "Reproducir video", "Video abspielen", "Воспроизвести видео", "Відтворити відео", "동영상 재생", "動画を再生"],
    "Open on YouTube": ["Abrir no YouTube", "Abrir en YouTube", "Auf YouTube öffnen", "Открыть на YouTube", "Відкрити на YouTube", "YouTube에서 열기", "YouTubeで開く"],
    "views": ["visualizações", "vistas", "Aufrufe", "просмотров", "переглядів", "조회", "回視聴"],
    "Videos are the most viewed Shorts of the last 2 days in the language of the country chosen above, found by YouTube search and ranked by views. Clicking one opens the whole ranking as a YouTube playlist. Refreshed every 12 hours.": ["Os vídeos são os Shorts mais vistos dos últimos 2 dias no idioma do país escolhido acima, encontrados pela busca do YouTube e ranqueados por visualizações. Clicar em um abre o ranking inteiro como playlist do YouTube. Atualizados a cada 12 horas.", "Los videos son los Shorts más vistos de los últimos 2 días en el idioma del país elegido arriba, encontrados con la búsqueda de YouTube y ordenados por vistas. Al hacer clic en uno se abre todo el ranking como lista de YouTube. Se actualizan cada 12 horas.", "Die Videos sind die meistgesehenen Shorts der letzten 2 Tage in der Sprache des oben gewählten Landes, über die YouTube-Suche gefunden und nach Aufrufen sortiert. Ein Klick öffnet das ganze Ranking als YouTube-Playlist. Alle 12 Stunden aktualisiert.", "Видео — самые просматриваемые Shorts за последние 2 дня на языке страны, выбранной выше, найденные поиском YouTube и отсортированные по просмотрам. Нажатие открывает весь рейтинг как плейлист YouTube. Обновляется каждые 12 часов.", "Відео — найпопулярніші Shorts за останні 2 дні мовою країни, вибраної вище, знайдені пошуком YouTube і відсортовані за переглядами. Натискання відкриває весь рейтинг як плейлист YouTube. Оновлюється кожні 12 годин.", "동영상은 위에서 선택한 국가의 언어로 된 최근 2일간 조회수가 가장 많은 Shorts로, YouTube 검색으로 찾아 조회수 순으로 정렬했습니다. 하나를 클릭하면 전체 순위가 YouTube 재생목록으로 열립니다. 12시간마다 업데이트됩니다.", "動画は上で選んだ国の言語で過去2日間に最も再生されたショートで、YouTube検索で見つけ、再生回数順に並べています。クリックするとランキング全体がYouTubeの再生リストで開きます。12時間ごとに更新。"],
    "Next story": ["Próxima notícia", "Siguiente noticia", "Nächste Meldung", "Следующая новость", "Наступна новина", "다음 소식", "次の記事"],
    "You're all caught up": ["Você viu todas as notícias", "Ya viste todas las noticias", "Du bist auf dem neuesten Stand", "Вы просмотрели все новости", "Ви переглянули всі новини", "모든 소식을 확인했습니다", "すべての記事を表示しました"],
    "Latest creator-economy headlines from Google News, in the selected language first, then other languages. Photos are each article's own preview image. Refreshed hourly.": ["Últimas manchetes da economia dos criadores no Google News, primeiro no idioma do país escolhido acima e depois em outros idiomas. As fotos são a imagem de prévia de cada matéria. Atualizado a cada hora.", "Últimos titulares de la economía de los creadores en Google News, primero en el idioma seleccionado y luego en otros idiomas. Las fotos son la imagen de vista previa de cada artículo. Se actualiza cada hora.", "Neueste Schlagzeilen zur Creator Economy aus Google News, zuerst in der gewählten Sprache, dann in anderen Sprachen. Die Fotos sind das Vorschaubild des jeweiligen Artikels. Stündlich aktualisiert.", "Последние заголовки об экономике авторов из Google News: сначала на выбранном языке, затем на других. Фото — изображение предпросмотра самой статьи. Обновляется каждый час.", "Останні заголовки про економіку авторів із Google News: спершу обраною мовою, потім іншими. Фото — зображення попереднього перегляду самої статті. Оновлюється щогодини.", "Google 뉴스의 최신 크리에이터 경제 헤드라인을 선택한 언어로 먼저, 이어서 다른 언어로 보여줍니다. 사진은 각 기사의 미리보기 이미지입니다. 매시간 업데이트됩니다.", "Google ニュースのクリエイター経済の最新見出しを、選択した言語で先に、続いて他の言語で表示します。写真は各記事のプレビュー画像です。1時間ごとに更新。"],
    "Previous": ["Anterior", "Anterior", "Zurück", "Назад", "Назад", "이전", "前へ"],
    "Next": ["Próximo", "Siguiente", "Weiter", "Далее", "Далі", "다음", "次へ"],
    "Latest creator-economy headlines from Google News in the selected language. Photos are each article's own preview image. Refreshed hourly.": ["Últimas manchetes da economia dos criadores no Google News, no idioma do país escolhido acima. As fotos são a imagem de prévia de cada matéria. Atualizado a cada hora.", "Últimos titulares de la economía de creadores en Google News, en el idioma seleccionado. Las fotos son la imagen de vista previa de cada artículo. Se actualiza cada hora.", "Neueste Creator-Economy-Schlagzeilen aus Google News in der gewählten Sprache. Die Fotos sind das Vorschaubild des jeweiligen Artikels. Stündlich aktualisiert.", "Свежие заголовки об экономике авторов из Google News на выбранном языке. Фото — превью-изображения самих статей. Обновляется каждый час.", "Свіжі заголовки про економіку авторів із Google News вибраною мовою. Фото — прев’ю-зображення самих статей. Оновлюється щогодини.", "선택한 언어의 Google News 크리에이터 경제 최신 헤드라인입니다. 사진은 각 기사의 미리보기 이미지입니다. 매시간 업데이트됩니다.", "選択した言語のGoogleニュースから、クリエイター経済の最新見出しを表示します。写真は各記事のプレビュー画像です。1時間ごとに更新。"],
    "Trending in the most countries": ["Em alta em mais países", "En tendencia en más países", "In den meisten Ländern im Trend", "В трендах в наибольшем числе стран", "У трендах у найбільшій кількості країн", "가장 많은 국가에서 인기 급상승", "最も多くの国で急上昇中"],
    "countries": ["países", "países", "Länder", "стран", "країн", "개국", "か国"],
    "Channels that appear in the most countries' YouTube Trending top 10 right now, out of all the countries we track. Brands and studios are included alongside creators. Ties go to the higher average chart position. Refreshed hourly.": ["Canais que aparecem no top 10 de Em alta do YouTube no maior número de países agora, entre todos os países que acompanhamos. Marcas e estúdios aparecem junto com criadores. Em caso de empate, vence a melhor posição média. Atualizado a cada hora.", "Canales que aparecen en el top 10 de Tendencias de YouTube en más países ahora mismo, entre todos los países que seguimos. Incluye marcas y estudios además de creadores. En caso de empate, gana la mejor posición media. Se actualiza cada hora.", "Kanäle, die gerade in den meisten Ländern in den YouTube-Trends-Top-10 stehen, von allen Ländern, die wir verfolgen. Marken und Studios sind neben Creators enthalten. Bei Gleichstand zählt die bessere durchschnittliche Platzierung. Stündlich aktualisiert.", "Каналы, которые сейчас входят в топ-10 трендов YouTube в наибольшем числе стран из всех, что мы отслеживаем. Наряду с авторами учитываются бренды и студии. При равенстве выше канал с лучшей средней позицией. Обновляется каждый час.", "Канали, які зараз входять до топ-10 трендів YouTube у найбільшій кількості країн з усіх, що ми відстежуємо. Разом з авторами враховуються бренди й студії. За рівності вище канал із кращою середньою позицією. Оновлюється щогодини.", "현재 추적 중인 모든 국가 중 가장 많은 국가의 YouTube 인기 급상승 상위 10위에 오른 채널입니다. 크리에이터뿐 아니라 브랜드와 스튜디오도 포함됩니다. 동점이면 평균 순위가 더 높은 채널이 앞에 옵니다. 매시간 업데이트됩니다.", "追跡しているすべての国のうち、現在最も多くの国でYouTube急上昇トップ10に入っているチャンネルです。クリエイターに加え、ブランドやスタジオも含まれます。同数の場合は平均順位が高い方が上位です。1時間ごとに更新。"],
    "What these numbers mean": ["O que esses números significam", "Qué significan estas cifras", "Was diese Zahlen bedeuten", "Что означают эти цифры", "Що означають ці числа", "이 수치의 의미", "この数値について"],
    "Close": ["Fechar", "Cerrar", "Schließen", "Закрыть", "Закрити", "닫기", "閉じる"],
    "An estimate of how many people are watching YouTube at the same moment in each country, on any screen: phones, computers, tablets and TVs. It counts people, not devices or monthly users.": ["Estimativa de quantas pessoas estão assistindo ao YouTube ao mesmo tempo em cada país, em qualquer tela: celulares, computadores, tablets e TVs. Conta pessoas, não aparelhos nem usuários mensais.", "Estimación de cuántas personas están viendo YouTube al mismo tiempo en cada país, en cualquier pantalla: móviles, computadoras, tabletas y televisores. Cuenta personas, no dispositivos ni usuarios mensuales.", "Schätzung, wie viele Menschen in jedem Land gleichzeitig YouTube schauen, auf jedem Bildschirm: Smartphones, Computer, Tablets und Fernseher. Gezählt werden Menschen, nicht Geräte oder monatliche Nutzer.", "Оценка того, сколько людей одновременно смотрят YouTube в каждой стране, на любом экране: телефоны, компьютеры, планшеты и телевизоры. Считаются люди, а не устройства или месячные пользователи.", "Оцінка того, скільки людей одночасно дивляться YouTube у кожній країні, на будь-якому екрані: телефони, комп’ютери, планшети й телевізори. Рахуються люди, а не пристрої чи місячні користувачі.", "각 국가에서 같은 시각에 YouTube를 시청 중인 사람 수의 추정치로, 휴대폰·컴퓨터·태블릿·TV 등 모든 화면을 포함합니다. 기기 수나 월간 사용자가 아니라 사람 수를 셉니다.", "各国で同じ時刻にYouTubeを視聴している人数の推定値です。スマートフォン、パソコン、タブレット、テレビなど、あらゆる画面を含みます。端末数や月間ユーザー数ではなく、人数を数えています。"],
    "Modelled, not measured: YouTube does not publish live viewer counts. Each figure is YouTube users in that country (Google's ad-reach figures, late 2025, via DataReportal) × about 80 minutes of viewing per person per day, spread over the day by a typical hourly viewing pattern.": ["Modelado, não medido: o YouTube não divulga contagens de espectadores ao vivo. Cada número é o total de usuários do YouTube no país (alcance publicitário informado pelo Google, final de 2025, via DataReportal) × cerca de 80 minutos de visualização por pessoa por dia, distribuídos ao longo do dia por um padrão típico de audiência por hora.", "Modelado, no medido: YouTube no publica cifras de espectadores en vivo. Cada cifra es el número de usuarios de YouTube en el país (alcance publicitario según Google, finales de 2025, vía DataReportal) × unos 80 minutos de visualización por persona al día, repartidos a lo largo del día según un patrón horario típico de audiencia.", "Modelliert, nicht gemessen: YouTube veröffentlicht keine Live-Zuschauerzahlen. Jede Zahl ist die Zahl der YouTube-Nutzer im Land (Googles Werbereichweite, Ende 2025, via DataReportal) × etwa 80 Minuten Wiedergabe pro Person und Tag, über den Tag verteilt nach einem typischen stündlichen Nutzungsmuster.", "Это модель, а не измерение: YouTube не публикует данные о зрителях в реальном времени. Каждая цифра — число пользователей YouTube в стране (рекламный охват по данным Google, конец 2025 г., через DataReportal) × около 80 минут просмотра на человека в день, распределённых по суткам по типичной почасовой схеме.", "Це модель, а не вимірювання: YouTube не публікує даних про глядачів у реальному часі. Кожне число — кількість користувачів YouTube у країні (рекламне охоплення за даними Google, кінець 2025 р., через DataReportal) × близько 80 хвилин перегляду на людину на день, розподілених протягом доби за типовою погодинною схемою.", "측정값이 아닌 모델 추정치입니다. YouTube는 실시간 시청자 수를 공개하지 않습니다. 각 수치는 해당 국가의 YouTube 사용자 수(Google 광고 도달 범위, 2025년 말, DataReportal 기준) × 1인당 하루 약 80분의 시청 시간을 일반적인 시간대별 시청 패턴에 따라 하루에 분배한 값입니다.", "実測値ではなくモデルによる推定です。YouTubeはリアルタイムの視聴者数を公開していません。各数値は、その国のYouTubeユーザー数（Googleの広告リーチ、2025年末、DataReportal経由）× 1人あたり1日約80分の視聴時間を、一般的な時間帯別の視聴パターンで1日に配分したものです。"],
    "Recalculated at 03:00 and 15:00 UTC, the two daily viewing peaks across these countries. Read the figures as an order of magnitude, not an exact count.": ["Recalculado às 03:00 e às 15:00 UTC, os dois picos diários de audiência nesses países. Considere os números uma ordem de grandeza, não uma contagem exata.", "Se recalcula a las 03:00 y 15:00 UTC, los dos picos diarios de audiencia en estos países. Tome las cifras como un orden de magnitud, no como un recuento exacto.", "Neu berechnet um 03:00 und 15:00 UTC, den zwei täglichen Nutzungsspitzen in diesen Ländern. Die Zahlen zeigen eine Größenordnung, keine exakte Zählung.", "Пересчитывается в 03:00 и 15:00 UTC — в два суточных пика просмотров в этих странах. Воспринимайте цифры как порядок величины, а не точный подсчёт.", "Перераховується о 03:00 і 15:00 UTC — у два добові піки переглядів у цих країнах. Сприймайте числа як порядок величини, а не точний підрахунок.", "매일 03:00과 15:00 UTC, 이 국가들의 하루 두 번의 시청 피크 시각에 다시 계산됩니다. 정확한 집계가 아닌 대략적인 규모로 보시기 바랍니다.", "毎日03:00と15:00 UTC（これらの国々の1日2回の視聴ピーク）に再計算されます。正確な集計ではなく、おおよその規模としてご覧ください。"],
    'Live data, 24/7': ['Dados ao vivo, 24/7', 'Datos en vivo, 24/7', 'Live-Daten, 24/7', 'Данные в реальном времени, 24/7', 'Дані в реальному часі, 24/7', '실시간 데이터, 24/7', 'リアルタイムデータ、24時間365日'],
    "Monthly views, comments, estimated earnings, subscribers, total views, country, join date, views per video and the top 5 videos of the last 30 days.": ['Visualizações mensais, comentários, ganhos estimados, inscritos, visualizações totais, país, data de criação, visualizações por vídeo e os 5 vídeos mais vistos dos últimos 30 dias.', 'Vistas mensuales, comentarios, ganancias estimadas, suscriptores, vistas totales, país, fecha de creación, vistas por video y los 5 videos más vistos de los últimos 30 días.', 'Monatliche Aufrufe, Kommentare, geschätzte Einnahmen, Abonnenten, Gesamtaufrufe, Land, Beitrittsdatum, Aufrufe pro Video und die Top 5 Videos der letzten 30 Tage.', 'Просмотры за месяц, комментарии, оценка доходов, подписчики, всего просмотров, страна, дата регистрации, просмотры по видео и топ-5 видео за последние 30 дней.', 'Перегляди за місяць, коментарі, оцінка доходів, підписники, усього переглядів, країна, дата реєстрації, перегляди за відео та топ-5 відео за останні 30 днів.', '월간 조회수, 댓글, 예상 수익, 구독자, 총 조회수, 국가, 가입일, 동영상별 조회수, 최근 30일 상위 5개 동영상.', '月間再生回数、コメント、推定収益、登録者数、総再生回数、国、開設日、動画ごとの再生回数、過去30日のトップ5動画。'],
    'Single': ['Individual', 'Individual', 'Einzeln', 'Один канал', 'Один канал', '단일 채널', '1チャンネル'],
    'Versus': ['Versus', 'Versus', 'Versus', 'Сравнение', 'Порівняння', '비교', '比較'],
    'Search': ['Pesquisar', 'Buscar', 'Suchen', 'Найти', 'Знайти', '검색', '検索'],
    'Search any YouTube Channel': ['Pesquise qualquer canal do YouTube', 'Busca cualquier canal de YouTube', 'Jeden YouTube-Kanal durchsuchen', 'Найти любой канал YouTube', 'Знайти будь-який канал YouTube', '모든 YouTube 채널 검색', 'YouTubeチャンネルを検索'],
    'Sponsored': ['Patrocinado', 'Patrocinado', 'Gesponsert', 'Реклама', 'Реклама', '스폰서', 'スポンサー'],
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
    'MrBeast or channel URL': ['MrBeast ou URL do canal', 'MrBeast o URL del canal', 'MrBeast oder Kanal-URL', 'MrBeast или ссылка на канал', 'MrBeast або посилання на канал', 'MrBeast 또는 채널 URL', 'MrBeast またはチャンネルURL'],
    'Views per video': ['Visualizações por vídeo', 'Vistas por video', 'Aufrufe pro Video', 'Просмотры по видео', 'Перегляди за відео', '동영상별 조회수', '動画別の再生回数'],
    'Uploads in the last 30 days, oldest to newest': ['Vídeos dos últimos 30 dias, do mais antigo ao mais recente', 'Videos de los últimos 30 días, del más antiguo al más reciente', 'Uploads der letzten 30 Tage, vom ältesten zum neuesten', 'Видео за 30 дней, от старых к новым', 'Відео за 30 днів, від старіших до новіших', '최근 30일 업로드, 오래된 순', '過去30日の動画（古い順）'],
    'Top 5 · last 30 days': ['Top 5 · últimos 30 dias', 'Top 5 · últimos 30 días', 'Top 5 · letzte 30 Tage', 'Топ-5 · последние 30 дней', 'Топ-5 · останні 30 днів', '상위 5개 · 최근 30일', 'トップ5 · 過去30日'],
    'Shorts-length (≤3 min)': ['Duração de Shorts (≤3 min)', 'Duración de Shorts (≤3 min)', 'Shorts-Länge (≤3 Min.)', 'Длина Shorts (≤3 мин)', 'Довжина Shorts (≤3 хв)', '쇼츠 길이 (3분 이하)', 'ショート尺（3分以下）'],
    'Long-form': ['Vídeo longo', 'Formato largo', 'Langform', 'Длинные видео', 'Довгі відео', '롱폼', '長尺'],
    'Tap the line to see a video': ['Toque na linha para ver um vídeo', 'Toca la línea para ver un video', 'Tippe auf die Linie, um ein Video zu sehen', 'Нажмите на линию, чтобы увидеть видео', 'Натисніть на лінію, щоб побачити відео', '선을 누르면 동영상이 보여요', '線をタップすると動画を表示'],
    'Joined': ['Desde', 'Desde', 'Seit', 'На YouTube с', 'На YouTube з', '개설일', '開設日'],
    'Videos': ['Vídeos', 'Videos', 'Videos', 'Видео', 'Відео', '동영상', '動画'],
    'Subscribers': ['Inscritos', 'Suscriptores', 'Abonnenten', 'Подписчики', 'Підписники', '구독자', '登録者'],
    'Total views': ['Visualizações totais', 'Vistas totales', 'Aufrufe gesamt', 'Всего просмотров', 'Усього переглядів', '총 조회수', '総再生回数'],
    'views': ['visualizações', 'vistas', 'Aufrufe', 'просмотров', 'переглядів', '조회수', '回視聴'],
    'likes': ['curtidas', 'me gusta', 'Likes', 'лайков', 'вподобань', '좋아요', '高評価'],
    'comments': ['comentários', 'comentarios', 'Kommentare', 'комментариев', 'коментарів', '댓글', 'コメント'],
    'No uploads in the last 30 days.': ['Nenhum vídeo nos últimos 30 dias.', 'Sin videos en los últimos 30 días.', 'Keine Uploads in den letzten 30 Tagen.', 'Нет видео за последние 30 дней.', 'Немає відео за останні 30 днів.', '최근 30일 동안 업로드가 없어요.', '過去30日間の投稿はありません。'],
    'Opens the whole ranking as a YouTube playlist': ['Abre o ranking inteiro como playlist do YouTube', 'Abre todo el ranking como lista de YouTube', 'Öffnet das ganze Ranking als YouTube-Playlist', 'Открывает весь рейтинг как плейлист YouTube', 'Відкриває весь рейтинг як плейлист YouTube', '전체 순위를 YouTube 재생목록으로 열기', 'ランキング全体をYouTubeの再生リストで開く'],
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
    "How we estimate earnings: last-30-day views × a rate per 1,000 views. Long videos use the channel's country (about $3–$5 in the US, UK or Germany, $1.20–$2 in Brazil or Mexico, $0.45–$0.75 in India or Nigeria). Shorts use $0.04–$0.07. Education, science and how-to videos count ×1.3; music, gaming and comedy ×0.7. YouTube doesn't publish real payouts, so this is an estimate.": ["Como estimamos os ganhos: visualizações dos últimos 30 dias × um valor por mil visualizações. Vídeos longos usam o país do canal (cerca de US$3–5 nos EUA, Reino Unido ou Alemanha, US$1,20–2 no Brasil ou México, US$0,45–0,75 na Índia ou Nigéria). Shorts usam US$0,04–0,07. Vídeos de educação, ciência e tutoriais contam ×1,3; música, games e comédia ×0,7. O YouTube não divulga os pagamentos reais, então isto é uma estimativa.", "Cómo estimamos las ganancias: vistas de los últimos 30 días × una tarifa por cada mil vistas. Los videos largos usan el país del canal (unos US$3–5 en EE. UU., Reino Unido o Alemania, US$1,20–2 en Brasil o México, US$0,45–0,75 en India o Nigeria). Los Shorts usan US$0,04–0,07. Los videos de educación, ciencia y tutoriales cuentan ×1,3; música, videojuegos y comedia ×0,7. YouTube no publica los pagos reales, así que es una estimación.", "So schätzen wir die Einnahmen: Aufrufe der letzten 30 Tage × ein Betrag pro 1.000 Aufrufe. Lange Videos richten sich nach dem Land des Kanals (etwa 3–5 $ in den USA, Großbritannien oder Deutschland, 1,20–2 $ in Brasilien oder Mexiko, 0,45–0,75 $ in Indien oder Nigeria). Für Shorts gelten 0,04–0,07 $. Bildungs-, Wissenschafts- und Anleitungsvideos zählen ×1,3, Musik, Gaming und Comedy ×0,7. YouTube veröffentlicht keine echten Auszahlungen, daher ist das eine Schätzung.", "Как мы оцениваем доход: просмотры за 30 дней × ставка за 1000 просмотров. Для длинных видео учитывается страна канала (около $3–5 в США, Великобритании или Германии, $1,20–2 в Бразилии или Мексике, $0,45–0,75 в Индии или Нигерии). Для Shorts — $0,04–0,07. Образовательные, научные и обучающие видео считаются ×1,3; музыка, игры и юмор — ×0,7. YouTube не публикует реальные выплаты, поэтому это оценка.", "Як ми оцінюємо дохід: перегляди за 30 днів × ставка за 1000 переглядів. Для довгих відео враховується країна каналу (близько $3–5 у США, Великій Британії чи Німеччині, $1,20–2 у Бразилії чи Мексиці, $0,45–0,75 в Індії чи Нігерії). Для Shorts — $0,04–0,07. Освітні, наукові та навчальні відео рахуються ×1,3; музика, ігри та гумор — ×0,7. YouTube не публікує реальні виплати, тому це оцінка.", "수익 추정 방법: 최근 30일 조회수 × 조회수 1,000회당 단가. 긴 영상은 채널 국가 기준입니다(미국·영국·독일 약 $3–5, 브라질·멕시코 $1.20–2, 인도·나이지리아 $0.45–0.75). Shorts는 $0.04–0.07입니다. 교육·과학·하우투 영상은 ×1.3, 음악·게임·코미디는 ×0.7로 계산합니다. YouTube는 실제 지급액을 공개하지 않으므로 추정치입니다.", "収益の推定方法：直近30日の再生回数 × 1,000回あたりの単価。長尺動画はチャンネルの国で決まります（米国・英国・ドイツは約$3〜5、ブラジル・メキシコは$1.20〜2、インド・ナイジェリアは$0.45〜0.75）。ショートは$0.04〜0.07。教育・科学・ハウツー動画は×1.3、音楽・ゲーム・コメディは×0.7で計算します。YouTube は実際の支払額を公開していないため、推定値です。"],
    'Like Polling · Data via YouTube Data API · Earnings are estimates (by country, topic and Shorts)': ["Like Polling · Dados via YouTube Data API · Ganhos são estimativas (por país, tema e Shorts)", "Like Polling · Datos vía YouTube Data API · Las ganancias son estimaciones (por país, tema y Shorts)", "Like Polling · Daten über die YouTube Data API · Einnahmen sind Schätzungen (nach Land, Thema und Shorts)", "Like Polling · Данные через YouTube Data API · Доходы — оценка (по стране, теме и Shorts)", "Like Polling · Дані через YouTube Data API · Доходи — оцінка (за країною, темою та Shorts)", "Like Polling · 데이터: YouTube Data API · 수익은 추정치입니다(국가, 주제, Shorts 기준)", "Like Polling · データ：YouTube Data API · 収益は推定値です（国・トピック・ショートを考慮）"],
    "Open full report": ["Abrir relatório completo", "Abrir informe completo", "Vollständigen Bericht öffnen", "Открыть полный отчёт", "Відкрити повний звіт", "전체 리포트 열기", "詳細レポートを開く"],
    "Add to Chrome": ["Adicionar ao Chrome", "Añadir a Chrome", "Zu Chrome hinzufügen", "Добавить в Chrome", "Додати до Chrome", "Chrome에 추가", "Chrome に追加"],
    "Chrome Extension": ["Extensão do Chrome", "Extensión de Chrome", "Chrome-Erweiterung", "Расширение Chrome", "Розширення Chrome", "Chrome 확장 프로그램", "Chrome 拡張機能"],
    // Education widget
    "Education": ["Educação", "Educación", "Bildung", "Образование", "Освіта", "교육", "教育"],
    "What the world is learning on YouTube and talking about in the news.": ["O que o mundo está aprendendo no YouTube e discutindo nas notícias.", "Lo que el mundo está aprendiendo en YouTube y comentando en las noticias.", "Was die Welt auf YouTube lernt und worüber in den Nachrichten gesprochen wird.", "Чему мир учится на YouTube и что обсуждают в новостях.", "Чого світ навчається на YouTube і що обговорюють у новинах.", "세계가 YouTube에서 배우고 뉴스에서 이야기하는 것.", "世界がYouTubeで学び、ニュースで話題にしていること。"],
    "Education Index": ["Índice de Educação", "Índice de Educación", "Bildungs-Index", "Индекс образования", "Індекс освіти", "교육 지수", "教育指数"],
    "Most talked-about subjects": ["Assuntos mais comentados", "Temas más comentados", "Meistdiskutierte Themen", "Самые обсуждаемые темы", "Найобговорюваніші теми", "가장 많이 이야기되는 주제", "最も話題の分野"],
    "Speed": ["Velocidade", "Velocidad", "Tempo", "Скорость", "Швидкість", "속도", "スピード"],
    "Fastest-growing uploads of the last 30 days from the education channels we track in this country, at most 2 per channel. Speed = views per hour since upload. Refreshed twice a day.": ["Os vídeos que mais crescem entre os enviados nos últimos 30 dias pelos canais de educação que acompanhamos neste país, no máximo 2 por canal. Velocidade = visualizações por hora desde a publicação. Atualizado 2 vezes por dia.", "Los videos que más crecen entre los subidos en los últimos 30 días por los canales de educación que seguimos en este país, como máximo 2 por canal. Velocidad = vistas por hora desde la publicación. Se actualiza 2 veces al día.", "Die am schnellsten wachsenden Uploads der letzten 30 Tage der Bildungskanäle, die wir in diesem Land verfolgen, höchstens 2 pro Kanal. Tempo = Aufrufe pro Stunde seit Veröffentlichung. Zweimal täglich aktualisiert.", "Самые быстрорастущие видео за последние 30 дней с образовательных каналов, которые мы отслеживаем в этой стране, не более 2 на канал. Скорость = просмотры в час с момента публикации. Обновляется 2 раза в день.", "Найшвидше зростаючі відео за останні 30 днів з освітніх каналів, які ми відстежуємо в цій країні, не більше 2 на канал. Швидкість = перегляди за годину з моменту публікації. Оновлюється 2 рази на день.", "이 국가에서 추적하는 교육 채널이 최근 30일간 올린 영상 중 가장 빠르게 성장하는 영상(채널당 최대 2개). 속도 = 게시 후 시간당 조회수. 하루 2번 업데이트.", "この国で追跡している教育チャンネルが直近30日に投稿した動画のうち、最も伸びている動画（1チャンネル最大2本）。スピード＝投稿からの1時間あたりの再生回数。1日2回更新。"],
    "Countries with fewer than 5 videos look back 60 days, with up to 3 per channel.": ["Países com menos de 5 vídeos usam os últimos 60 dias, com até 3 por canal.", "Los países con menos de 5 videos usan los últimos 60 días, con hasta 3 por canal.", "Länder mit weniger als 5 Videos nutzen die letzten 60 Tage, mit bis zu 3 pro Kanal.", "Для стран, где меньше 5 видео, берутся последние 60 дней, до 3 видео с канала.", "Для країн, де менше 5 відео, беруться останні 60 днів, до 3 відео з каналу.", "영상이 5개 미만인 국가는 최근 60일을 보며, 채널당 최대 3개까지 표시합니다.", "動画が5本未満の国は直近60日間を対象とし、1チャンネル最大3本まで表示します。"],
    "Recent videos from those channels plus the last 24 hours of Google News education headlines, sorted into subjects by AI (Google Gemini). One video counts as much as 3 headlines. Shows what is being talked about, not what people are enrolled in.": ["Vídeos recentes desses canais mais as manchetes de educação do Google News das últimas 24 horas, classificados por assunto por IA (Google Gemini). Um vídeo vale o mesmo que 3 manchetes. Mostra o que está sendo comentado, não em que as pessoas estão matriculadas.", "Videos recientes de esos canales más los titulares de educación de Google News de las últimas 24 horas, clasificados por tema con IA (Google Gemini). Un video cuenta como 3 titulares. Muestra de qué se habla, no en qué se matricula la gente.", "Aktuelle Videos dieser Kanäle plus die Bildungsschlagzeilen von Google News der letzten 24 Stunden, von KI (Google Gemini) nach Themen sortiert. Ein Video zählt so viel wie 3 Schlagzeilen. Zeigt, worüber gesprochen wird, nicht, wofür sich Menschen einschreiben.", "Свежие видео этих каналов и заголовки Google News об образовании за последние 24 часа, распределённые по темам с помощью ИИ (Google Gemini). Одно видео весит как 3 заголовка. Показывает, что обсуждают, а не на что люди записываются.", "Свіжі відео цих каналів і заголовки Google News про освіту за останні 24 години, розподілені за темами за допомогою ШІ (Google Gemini). Одне відео важить як 3 заголовки. Показує, що обговорюють, а не на що люди записуються.", "해당 채널의 최근 영상과 최근 24시간 Google 뉴스 교육 헤드라인을 AI(Google Gemini)가 주제별로 분류했습니다. 영상 1개는 헤드라인 3개와 같은 비중입니다. 사람들이 실제로 등록한 분야가 아니라 이야기되는 주제를 보여줍니다.", "これらのチャンネルの最近の動画と、直近24時間のGoogleニュースの教育関連見出しを、AI（Google Gemini）が分野別に分類しています。動画1本は見出し3件分として数えます。実際の履修状況ではなく、話題になっている分野を示します。"],
    "video": ["vídeo", "video", "Video", "видео", "відео", "영상", "動画"],
    "videos": ["vídeos", "videos", "Videos", "видео", "відео", "영상", "動画"],
    "news": ["notícias", "noticias", "Meldungen", "новостей", "новин", "뉴스", "ニュース"],
    "News": ["Notícias", "Noticias", "Nachrichten", "Новости", "Новини", "뉴스", "ニュース"],
    "No education data for this country yet.": ["Ainda não há dados de educação para este país.", "Aún no hay datos de educación para este país.", "Für dieses Land gibt es noch keine Bildungsdaten.", "Для этой страны пока нет данных об образовании.", "Для цієї країни ще немає даних про освіту.", "이 국가의 교육 데이터가 아직 없습니다.", "この国の教育データはまだありません。"],
    "Education data is unavailable right now.": ["Os dados de educação estão indisponíveis no momento.", "Los datos de educación no están disponibles en este momento.", "Bildungsdaten sind gerade nicht verfügbar.", "Данные об образовании сейчас недоступны.", "Дані про освіту зараз недоступні.", "지금은 교육 데이터를 사용할 수 없습니다.", "現在、教育データを利用できません。"],
    "Education channels and subjects by country": ["Canais e assuntos de educação por país", "Canales y temas de educación por país", "Bildungskanäle und Themen nach Land", "Образовательные каналы и темы по странам", "Освітні канали та теми за країнами", "국가별 교육 채널과 주제", "国別の教育チャンネルと分野"],
    "AI & Technology": ["IA e Tecnologia", "IA y Tecnología", "KI & Technik", "ИИ и технологии", "ШІ та технології", "AI·기술", "AI・テクノロジー"],
    "Space & Physics": ["Espaço e Física", "Espacio y Física", "Weltall & Physik", "Космос и физика", "Космос і фізика", "우주·물리", "宇宙・物理"],
    "Math": ["Matemática", "Matemáticas", "Mathematik", "Математика", "Математика", "수학", "数学"],
    "Health & Biology": ["Saúde e Biologia", "Salud y Biología", "Gesundheit & Biologie", "Здоровье и биология", "Здоров’я та біологія", "건강·생물", "健康・生物"],
    "Chemistry": ["Química", "Química", "Chemie", "Химия", "Хімія", "화학", "化学"],
    "Climate & Environment": ["Clima e Meio Ambiente", "Clima y Medio Ambiente", "Klima & Umwelt", "Климат и экология", "Клімат і довкілля", "기후·환경", "気候・環境"],
    "History & Geography": ["História e Geografia", "Historia y Geografía", "Geschichte & Geografie", "История и география", "Історія та географія", "역사·지리", "歴史・地理"],
    "Engineering & How things work": ["Engenharia e Como as coisas funcionam", "Ingeniería y Cómo funcionan las cosas", "Technik & Wie Dinge funktionieren", "Инженерия и как всё устроено", "Інженерія і як усе влаштовано", "공학·작동 원리", "工学・しくみ"],
    "Exams & Admissions": ["Vestibulares e Provas", "Exámenes y Admisiones", "Prüfungen & Zulassung", "Экзамены и поступление", "Іспити та вступ", "시험·입시", "試験・入試"],
    "Schools & Policy": ["Escolas e Políticas", "Escuelas y Políticas", "Schulen & Bildungspolitik", "Школы и политика", "Школи та політика", "학교·교육 정책", "学校・教育政策"],
    "Money & Careers": ["Dinheiro e Carreiras", "Dinero y Carreras", "Geld & Karriere", "Деньги и карьера", "Гроші та кар’єра", "돈·커리어", "お金・キャリア"],
    "Languages & Arts": ["Idiomas e Artes", "Idiomas y Artes", "Sprachen & Kunst", "Языки и искусство", "Мови та мистецтво", "언어·예술", "語学・芸術"],
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
    'Latest headlines from Google News in the selected language. Refreshed hourly.': ['Manchetes mais recentes do Google News no idioma do país escolhido acima. Atualizado a cada hora.', 'Titulares más recientes de Google News en el idioma seleccionado. Se actualiza cada hora.', 'Aktuelle Schlagzeilen von Google News in der gewählten Sprache. Stündlich aktualisiert.', 'Свежие заголовки Google News на выбранном языке. Обновляется каждый час.', 'Свіжі заголовки Google News обраною мовою. Оновлюється щогодини.', '선택한 언어의 Google News 최신 헤드라인. 매시간 업데이트.', '選択した言語のGoogle News最新見出し。1時間ごとに更新。'],
    "Extension": ["Extensão", "Extensión", "Erweiterung", "Расширение", "Розширення", "확장 프로그램", "拡張機能"],
    "YouTube rankings, who's trending and channel graphs, right on YouTube.": ["Rankings do YouTube, quem está em alta e gráficos de canais, direto no YouTube.", "Rankings de YouTube, quién es tendencia y gráficos de canales, directamente en YouTube.", "YouTube-Rankings, wer im Trend liegt, und Kanal-Grafiken – direkt auf YouTube.", "Рейтинги YouTube, кто в трендах и графики каналов — прямо на YouTube.", "Рейтинги YouTube, хто в трендах, і графіки каналів — просто на YouTube.", "YouTube 순위, 인기 급상승 콘텐츠, 채널 그래프를 YouTube에서 바로 확인하세요.", "YouTube のランキング、急上昇中の動画、チャンネルのグラフを YouTube 上でそのまま表示。"],
    "Free Extension": ["Extensão gratuita", "Extensión gratuita", "Kostenlose Erweiterung", "Бесплатное расширение", "Безкоштовне розширення", "무료 확장 프로그램", "無料拡張機能"],
    "Add to Chrome · it's free": ["Adicionar ao Chrome · é grátis", "Añadir a Chrome · es gratis", "Zu Chrome hinzufügen · kostenlos", "Установить в Chrome · бесплатно", "Додати в Chrome · безкоштовно", "Chrome에 추가 · 무료", "Chrome に追加 · 無料"],
    "Works on youtube.com in Chrome, Edge, Brave, Arc and Opera on computers (not on phones). After installing, open YouTube: the Creators + button appears on the left.": ["Funciona no youtube.com, no Chrome, Edge, Brave, Arc e Opera em computadores (não no celular). Depois de instalar, abra o YouTube: o botão Creators + aparece à esquerda.", "Funciona en youtube.com, en Chrome, Edge, Brave, Arc y Opera en computadoras (no en celulares). Después de instalarla, abre YouTube: el botón Creators + aparece a la izquierda.", "Funktioniert auf youtube.com in Chrome, Edge, Brave, Arc und Opera am Computer (nicht auf dem Handy). Nach der Installation YouTube öffnen: Der Creators +-Button erscheint links.", "Работает на youtube.com в Chrome, Edge, Brave, Arc и Opera на компьютере (не на телефоне). После установки откройте YouTube: кнопка Creators + появится слева.", "Працює на youtube.com у Chrome, Edge, Brave, Arc та Opera на комп’ютері (не на телефоні). Після встановлення відкрийте YouTube: кнопка Creators + з’явиться ліворуч.", "컴퓨터의 Chrome, Edge, Brave, Arc, Opera에서 youtube.com에 작동합니다(휴대폰 제외). 설치 후 YouTube를 열면 왼쪽에 Creators + 버튼이 나타납니다.", "パソコンの Chrome、Edge、Brave、Arc、Opera の youtube.com で使えます（スマホ不可）。インストール後に YouTube を開くと、左側に Creators + ボタンが表示されます。"],
    "Rankings": ["Rankings", "Rankings", "Rankings", "Рейтинги", "Рейтинги", "순위", "ランキング"],
    "Who's trending": ["Quem está em alta", "Quién es tendencia", "Wer im Trend liegt", "Кто в трендах", "Хто в трендах", "인기 급상승", "急上昇中"],
    "Graphs": ["Gráficos", "Gráficos", "Grafiken", "Графики", "Графіки", "그래프", "グラフ"],
    "Which videos trend in the most countries": ["Os vídeos em alta em mais países", "Los videos en tendencia en más países", "Videos, die in den meisten Ländern im Trend sind", "Видео в трендах в наибольшем числе стран", "Відео в трендах у найбільшій кількості країн", "가장 많은 국가에서 인기 급상승 중인 동영상", "最も多くの国で急上昇中の動画"],
    "Each country's top videos and how fast they grow": ["Os principais vídeos de cada país e a velocidade com que crescem", "Los videos principales de cada país y qué tan rápido crecen", "Die Top-Videos jedes Landes und wie schnell sie wachsen", "Лучшие видео каждой страны и скорость их роста", "Найкращі відео кожної країни та швидкість їхнього зростання", "국가별 인기 동영상과 성장 속도", "各国の人気動画と伸びの速さ"],
    "Any channel's last 30 days, video by video": ["Os últimos 30 dias de qualquer canal, vídeo a vídeo", "Los últimos 30 días de cualquier canal, video a video", "Die letzten 30 Tage jedes Kanals, Video für Video", "Последние 30 дней любого канала, видео за видео", "Останні 30 днів будь-якого каналу, відео за відео", "모든 채널의 최근 30일, 동영상별로", "任意のチャンネルの直近30日を動画ごとに"],
    "See any YouTube channel's stats, rankings and who's trending, right on YouTube.": ["Veja as estatísticas de qualquer canal do YouTube, os rankings e quem está em alta, direto no YouTube.", "Mira las estadísticas de cualquier canal de YouTube, los rankings y quién es tendencia, directamente en YouTube.", "Statistiken jedes YouTube-Kanals, Rankings und wer im Trend liegt – direkt auf YouTube.", "Статистика любого канала YouTube, рейтинги и кто в трендах — прямо на YouTube.", "Статистика будь-якого каналу YouTube, рейтинги й хто в трендах — просто на YouTube.", "모든 YouTube 채널의 통계, 순위, 인기 급상승 콘텐츠를 YouTube에서 바로 확인하세요.", "あらゆる YouTube チャンネルの統計、ランキング、急上昇中の動画を YouTube 上でそのまま確認。"],
    "Creators + works on computers": ["O Creators + funciona em computadores", "Creators + funciona en computadoras", "Creators + funktioniert auf Computern", "Creators + работает на компьютерах", "Creators + працює на комп'ютерах", "Creators +는 컴퓨터에서 작동합니다", "Creators + はパソコンで使えます"],
    "Open this link in Chrome on your computer to install it. Send it to yourself:": ["Abra este link no Chrome do seu computador para instalar. Envie para você mesmo:", "Abre este enlace en Chrome en tu computadora para instalarlo. Envíatelo:", "Öffne diesen Link in Chrome auf deinem Computer, um es zu installieren. Schick ihn dir selbst:", "Откройте эту ссылку в Chrome на компьютере, чтобы установить. Отправьте её себе:", "Відкрийте це посилання в Chrome на комп'ютері, щоб установити. Надішліть його собі:", "컴퓨터의 Chrome에서 이 링크를 열어 설치하세요. 나에게 보내기:", "パソコンの Chrome でこのリンクを開いてインストールしてください。自分に送る:"],
    "Copy link": ["Copiar link", "Copiar enlace", "Link kopieren", "Копировать ссылку", "Копіювати посилання", "링크 복사", "リンクをコピー"],
    "Link copied": ["Link copiado", "Enlace copiado", "Link kopiert", "Ссылка скопирована", "Посилання скопійовано", "링크 복사됨", "コピーしました"],
    "Share": ["Compartilhar", "Compartir", "Teilen", "Поделиться", "Поділитися", "공유", "共有"],
    "Open this page in Chrome to install": ["Abra esta página no Chrome para instalar", "Abre esta página en Chrome para instalar", "Öffne diese Seite in Chrome, um zu installieren", "Откройте эту страницу в Chrome для установки", "Відкрийте цю сторінку в Chrome для встановлення", "설치하려면 Chrome에서 이 페이지를 여세요", "インストールするには Chrome でこのページを開いてください"],
    "Creators + works in Chrome, Edge, Brave, Arc and Opera. Firefox and Safari aren't supported yet.": ["O Creators + funciona no Chrome, Edge, Brave, Arc e Opera. Firefox e Safari ainda não são compatíveis.", "Creators + funciona en Chrome, Edge, Brave, Arc y Opera. Firefox y Safari aún no son compatibles.", "Creators + funktioniert in Chrome, Edge, Brave, Arc und Opera. Firefox und Safari werden noch nicht unterstützt.", "Creators + работает в Chrome, Edge, Brave, Arc и Opera. Firefox и Safari пока не поддерживаются.", "Creators + працює в Chrome, Edge, Brave, Arc і Opera. Firefox і Safari поки не підтримуються.", "Creators +는 Chrome, Edge, Brave, Arc, Opera에서 작동합니다. Firefox와 Safari는 아직 지원되지 않습니다.", "Creators + は Chrome、Edge、Brave、Arc、Opera で使えます。Firefox と Safari にはまだ対応していません。"],
    "Using Edge? Click \"Allow extensions from other stores\" when asked.": ["Usa o Edge? Clique em \"Permitir extensões de outras lojas\" quando pedir.", "¿Usas Edge? Haz clic en \"Permitir extensiones de otras tiendas\" cuando te lo pida.", "Du nutzt Edge? Klicke auf „Erweiterungen aus anderen Stores zulassen“, wenn du gefragt wirst.", "Используете Edge? Нажмите «Разрешить расширения из других магазинов», когда появится запрос.", "Користуєтеся Edge? Натисніть «Дозволити розширення з інших магазинів», коли з’явиться запит.", "Edge를 사용하나요? 요청이 표시되면 \"다른 스토어의 확장 허용\"을 클릭하세요.", "Edge をお使いの場合は、表示された「他のストアからの拡張機能を許可する」をクリックしてください。"],
    "Set up in 30 seconds": ["Configure em 30 segundos", "Listo en 30 segundos", "In 30 Sekunden eingerichtet", "Настройка за 30 секунд", "Налаштування за 30 секунд", "30초면 설정 완료", "30 秒でセットアップ"],
    "Add to Chrome": ["Usar no Chrome", "Añadir a Chrome", "Zu Chrome hinzufügen", "Установить", "Додати в Chrome", "Chrome에 추가", "Chrome に追加"],
    "Click \"Add to Chrome\", then \"Add extension\".": ["Clique em \"Usar no Chrome\" e depois em \"Adicionar extensão\".", "Haz clic en \"Añadir a Chrome\" y luego en \"Añadir extensión\".", "Klicke auf „Zu Chrome hinzufügen“ und dann auf „Erweiterung hinzufügen“.", "Нажмите «Установить», затем «Установить расширение».", "Натисніть «Додати в Chrome», потім «Додати розширення».", "\"Chrome에 추가\"를 클릭한 다음 \"확장 프로그램 추가\"를 클릭하세요.", "「Chrome に追加」をクリックし、「拡張機能を追加」をクリックします。"],
    "Open any YouTube channel. A Creators + button appears on the left.": ["Abra qualquer canal do YouTube. Um botão Creators + aparece à esquerda.", "Abre cualquier canal de YouTube. Aparece un botón de Creators + a la izquierda.", "Öffne einen beliebigen YouTube-Kanal. Links erscheint ein Creators +-Button.", "Откройте любой канал YouTube. Слева появится кнопка Creators +.", "Відкрийте будь-який канал YouTube. Ліворуч з’явиться кнопка Creators +.", "아무 YouTube 채널이나 여세요. 왼쪽에 Creators + 버튼이 나타납니다.", "YouTube のチャンネルを開くと、左側に Creators + ボタンが表示されます。"],
    "Click it to see the channel's stats, graphs and top videos.": ["Clique nele para ver as estatísticas, os gráficos e os principais vídeos do canal.", "Haz clic para ver las estadísticas, los gráficos y los videos principales del canal.", "Klicke darauf für Statistiken, Grafiken und Top-Videos des Kanals.", "Нажмите на неё, чтобы увидеть статистику, графики и лучшие видео канала.", "Натисніть її, щоб побачити статистику, графіки й найкращі відео каналу.", "클릭하면 채널 통계, 그래프, 인기 동영상을 볼 수 있습니다.", "クリックすると、チャンネルの統計、グラフ、人気動画が表示されます。"],
    "Tip: click the puzzle icon at the top right of Chrome and pin Creators +. Its icon shows what's trending on any website.": ["Dica: clique no ícone de quebra-cabeça no canto superior direito do Chrome e fixe o Creators +. O ícone mostra o que está em alta em qualquer site.", "Consejo: haz clic en el icono de pieza de rompecabezas arriba a la derecha de Chrome y fija Creators +. Su icono muestra lo que es tendencia en cualquier sitio web.", "Tipp: Klicke oben rechts in Chrome auf das Puzzle-Symbol und hefte Creators + an. Das Symbol zeigt auf jeder Website, was im Trend liegt.", "Совет: нажмите значок пазла в правом верхнем углу Chrome и закрепите Creators +. Его значок показывает тренды на любом сайте.", "Порада: натисніть значок пазла у правому верхньому куті Chrome і закріпіть Creators +. Його значок показує тренди на будь-якому сайті.", "팁: Chrome 오른쪽 위의 퍼즐 아이콘을 클릭해 Creators +를 고정하세요. 아이콘으로 어느 사이트에서든 인기 급상승 콘텐츠를 볼 수 있습니다.", "ヒント: Chrome 右上のパズルアイコンをクリックして Creators + を固定すると、どのサイトでもアイコンから急上昇中の動画を確認できます。"],
    "What you get": ["O que você recebe", "Lo que obtienes", "Was du bekommst", "Что вы получаете", "Що ви отримуєте", "주요 기능", "できること"],
    "Privacy": ["Privacidade", "Privacidad", "Datenschutz", "Конфиденциальность", "Конфіденційність", "개인정보 보호", "プライバシー"],
    "Human + AI analytics for what the world watches": ["O que o mundo assiste, analisado por humano + IA", "Lo que el mundo ve, analizado por humano + IA", "Was die Welt schaut – analysiert von Mensch + KI", "Аналитика того, что смотрит мир: человек + ИИ", "Аналітика того, що дивиться світ: людина + ШІ", "사람 + AI가 분석하는 세계가 보는 콘텐츠", "人 + AI で世界が見ているものを分析"],
    "Sources: YouTube Data API · Google News · Google Gemini (AI)": ["Fontes: YouTube Data API · Google News · Google Gemini (IA)", "Fuentes: YouTube Data API · Google News · Google Gemini (IA)", "Quellen: YouTube Data API · Google News · Google Gemini (KI)", "Источники: YouTube Data API · Google News · Google Gemini (ИИ)", "Джерела: YouTube Data API · Google News · Google Gemini (ШІ)", "출처: YouTube Data API · Google News · Google Gemini (AI)", "出典: YouTube Data API · Google News · Google Gemini (AI)"],
    "Like Polling \u00b7 Human + AI analytics for YouTube and global trends": ["Like Polling · YouTube e tendências globais, analisados por humano + IA", "Like Polling · YouTube y tendencias globales, analizados por humano + IA", "Like Polling · YouTube und globale Trends – analysiert von Mensch + KI", "Like Polling · Аналитика YouTube и мировых трендов: человек + ИИ", "Like Polling · Аналітика YouTube і світових трендів: людина + ШІ", "Like Polling · 사람 + AI가 분석하는 YouTube와 글로벌 트렌드", "Like Polling · 人 + AI による YouTube と世界のトレンド分析"],
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
    "What the world is learning on YouTube and talking about in the news.": "O que o mundo está a aprender no YouTube e a discutir nas notícias.",
    "Fastest-growing uploads of the last 30 days from the education channels we track in this country, at most 2 per channel. Speed = views per hour since upload. Refreshed twice a day.": "Os vídeos que mais crescem entre os publicados nos últimos 30 dias pelos canais de educação que acompanhamos neste país, no máximo 2 por canal. Velocidade = visualizações por hora desde a publicação. Atualizado 2 vezes por dia.",
    "Recent videos from those channels plus the last 24 hours of Google News education headlines, sorted into subjects by AI (Google Gemini). One video counts as much as 3 headlines. Shows what is being talked about, not what people are enrolled in.": "Vídeos recentes desses canais mais as manchetes de educação do Google News das últimas 24 horas, classificados por assunto por IA (Google Gemini). Um vídeo vale o mesmo que 3 manchetes. Mostra o que está a ser comentado, não em que as pessoas estão inscritas.",
    "Education data is unavailable right now.": "Os dados de educação estão indisponíveis de momento.",
    "Climate & Environment": "Clima e Ambiente",
    "Exams & Admissions": "Exames e Candidaturas",
    "likes": "gostos",
    "Subscribers": "Subscritores",
    "MrBeast or channel URL": "MrBeast ou URL do canal",
    "Read story": "Ler notícia",
    "You're all caught up": "Já viu todas as notícias",
    "Videos are the most viewed Shorts of the last 2 days in the language of the country chosen above, found by YouTube search and ranked by views. Clicking one opens the whole ranking as a YouTube playlist. Refreshed every 12 hours.": "Os vídeos são os Shorts mais vistos dos últimos 2 dias no idioma do país escolhido acima, encontrados pela pesquisa do YouTube, e ordenados por visualizações. Clicar num deles abre o ranking inteiro como lista de reprodução do YouTube. Atualizados a cada 12 horas.",
    "Latest creator-economy headlines from Google News, in the selected language first, then other languages. Photos are each article's own preview image. Refreshed hourly.": "Últimas notícias da economia dos criadores no Google News, primeiro no idioma do país escolhido acima e depois noutros idiomas. As fotos são a imagem de pré-visualização de cada notícia. Atualizado de hora a hora.",
    "Search channel": "Pesquisar canal",
    "Next": "Seguinte",
    "Latest creator-economy headlines from Google News in the selected language. Photos are each article's own preview image. Refreshed hourly.": "Últimas notícias da economia dos criadores no Google News, no idioma do país escolhido acima. As fotos são a imagem de pré-visualização de cada notícia. Atualizado de hora a hora.",
    "Trending in the most countries": "Em tendência em mais países",
    "Channels that appear in the most countries' YouTube Trending top 10 right now, out of all the countries we track. Brands and studios are included alongside creators. Ties go to the higher average chart position. Refreshed hourly.": "Canais que aparecem no top 10 de Tendências do YouTube no maior número de países neste momento, entre todos os países que acompanhamos. Marcas e estúdios aparecem juntamente com criadores. Em caso de empate, ganha a melhor posição média. Atualizado de hora a hora.",
    "What these numbers mean": "O que significam estes números",
    "An estimate of how many people are watching YouTube at the same moment in each country, on any screen: phones, computers, tablets and TVs. It counts people, not devices or monthly users.": "Estimativa de quantas pessoas estão a ver YouTube ao mesmo tempo em cada país, em qualquer ecrã: telemóveis, computadores, tablets e televisões. Conta pessoas, não dispositivos nem utilizadores mensais.",
    "Modelled, not measured: YouTube does not publish live viewer counts. Each figure is YouTube users in that country (Google's ad-reach figures, late 2025, via DataReportal) × about 80 minutes of viewing per person per day, spread over the day by a typical hourly viewing pattern.": "Modelado, não medido: o YouTube não divulga contagens de espectadores em direto. Cada número é o total de utilizadores do YouTube no país (alcance publicitário indicado pela Google, final de 2025, via DataReportal) × cerca de 80 minutos de visualização por pessoa por dia, distribuídos ao longo do dia por um padrão típico de audiência por hora.",
    "Recalculated at 03:00 and 15:00 UTC, the two daily viewing peaks across these countries. Read the figures as an order of magnitude, not an exact count.": "Recalculado às 03:00 e às 15:00 UTC, os dois picos diários de audiência nestes países. Considere os números uma ordem de grandeza, não uma contagem exata.",
    'Live data, 24/7': 'Dados em direto, 24/7',
    'Tracked channels': 'Canais monitorizados',
    'Est. watching': 'Est. a ver',
    "Human + AI analytics for what the world watches": "O que o mundo vê, analisado por humano + IA",
    'Like Polling | Human + AI analytics for what the world watches': "Like Polling | O que o mundo vê, analisado por humano + IA",
    'Estimated number of people watching YouTube right now, by country': 'Número estimado de pessoas a ver YouTube neste momento, por país',
    "Estimated number of people watching YouTube at the same moment in each country (not monthly users). Modelled from approximate YouTube users per country and the typical share watching at that local time of day, not measured. User counts per country: Google's YouTube ad-reach figures, late 2025 (via DataReportal). Recalculated at 03:00 and 15:00 UTC, the two daily peaks in viewing across these countries.": 'Número estimado de pessoas a ver YouTube ao mesmo tempo em cada país (não utilizadores mensais). Modelado a partir do número aproximado de utilizadores do YouTube por país e da parcela típica que vê àquela hora local, não medido. Utilizadores por país: alcance publicitário do YouTube indicado pela Google, final de 2025 (via DataReportal). Recalculado às 03:00 e às 15:00 UTC, os dois picos diários de audiência nestes países.',
    'Searching database…': 'A pesquisar na base de dados…',
    'Refreshing live metrics…': 'A atualizar métricas em direto…',
    'Fetching live data from YouTube…': 'A obter dados em direto do YouTube…',
    'Loading from database…': 'A carregar a partir da base de dados…',
    'AI summary unavailable for this snapshot.': 'Resumo de IA indisponível para este registo.',
    "How we estimate earnings: last-30-day views × a rate per 1,000 views. Long videos use the channel's country (about $3–$5 in the US, UK or Germany, $1.20–$2 in Brazil or Mexico, $0.45–$0.75 in India or Nigeria). Shorts use $0.04–$0.07. Education, science and how-to videos count ×1.3; music, gaming and comedy ×0.7. YouTube doesn't publish real payouts, so this is an estimate.": "Como estimamos os ganhos: visualizações dos últimos 30 dias × um valor por mil visualizações. Vídeos longos usam o país do canal (cerca de 3–5 US$ nos EUA, Reino Unido ou Alemanha, 1,20–2 US$ no Brasil ou México, 0,45–0,75 US$ na Índia ou Nigéria). Shorts usam 0,04–0,07 US$. Vídeos de educação, ciência e tutoriais contam ×1,3; música, jogos e comédia ×0,7. O YouTube não divulga os pagamentos reais, por isso isto é uma estimativa.",
    'Like Polling · Data via YouTube Data API · Earnings are estimates (by country, topic and Shorts)': 'Like Polling · Dados via YouTube Data API · Os ganhos são estimativas (por país, tema e Shorts)',
    'Likes': 'Gostos',
    'YouTube trending videos by country': 'Vídeos em tendência no YouTube por país',
    'YouTube trending music by country': 'Músicas em tendência no YouTube por país',
    "YouTube's own Trending chart for each country, via the YouTube Data API. Refreshed hourly.": 'Tabela oficial de Tendências do YouTube em cada país, via YouTube Data API. Atualizada de hora a hora.',
    "YouTube's own Trending chart for Music in each country, via the YouTube Data API. Refreshed hourly.": 'Tabela oficial de Tendências de Música do YouTube em cada país, via YouTube Data API. Atualizada de hora a hora.',
    'Trending data is unavailable right now.': 'Os dados de tendências estão indisponíveis de momento.',
    'No headlines in this filter yet.': 'Ainda não há títulos neste filtro.',
    'News is unavailable right now.': 'As notícias estão indisponíveis de momento.',
    'Latest headlines from Google News in the selected language. Refreshed hourly.': 'Últimos títulos do Google News no idioma do país escolhido acima. Atualizado de hora a hora.',
    [/^Showing cached data — live refresh failed \(([\s\S]*)\)\.$/.source]: 'A mostrar dados em cache — a atualização em direto falhou ($1).',
    [/^Database lookup failed: ([\s\S]*)$/.source]: 'Falha na consulta à base de dados: $1',
    "YouTube rankings, who's trending and channel graphs, right on YouTube.": "Rankings do YouTube, o que está em tendência e gráficos de canais, diretamente no YouTube.",
    "Who's trending": "Em tendência",
    "Which videos trend in the most countries": "Os vídeos em tendência em mais países",
    "Add to Chrome · it's free": "Adicionar ao Chrome · é gratuito",
    "Works on youtube.com in Chrome, Edge, Brave, Arc and Opera on computers (not on phones). After installing, open YouTube: the Creators + button appears on the left.": "Funciona no youtube.com, no Chrome, Edge, Brave, Arc e Opera em computadores (não no telemóvel). Depois de instalar, abra o YouTube: o botão Creators + aparece à esquerda.",
    "Open this link in Chrome on your computer to install it. Send it to yourself:": "Abra este link no Chrome do seu computador para o instalar. Envie-o para si:",
    "Share": "Partilhar",
    "See any YouTube channel's stats, rankings and who's trending, right on YouTube.": "Veja as estatísticas de qualquer canal do YouTube, os rankings e o que está em tendência, diretamente no YouTube.",
    "Tip: click the puzzle icon at the top right of Chrome and pin Creators +. Its icon shows what's trending on any website.": "Dica: clique no ícone de peça de puzzle no canto superior direito do Chrome e afixe o Creators +. O ícone mostra o que está em tendência em qualquer site.",
    "What you get": "O que recebe",
    "Creators + works in Chrome, Edge, Brave, Arc and Opera. Firefox and Safari aren't supported yet.": "O Creators + funciona no Chrome, Edge, Brave, Arc e Opera. O Firefox e o Safari ainda não são suportados.",
  };
  // Narrower wording inside a container: [selector, { English: [pt, es, de, ru, uk, ko, ja] }]
  const CONTEXT = [
    ['.edu-idx', { 'Speed': ['Veloc.', 'Veloc.', 'Tempo', 'Скор.', 'Швидк.', '속도', '速度'] }],
    ['.ytt', { 'Views': ['Visualiz.', 'Vistas', 'Aufrufe', 'Просм.', 'Перегл.', '조회수', '再生数'] }],
  ];
  const TITLES = {
    'Like Polling | Human + AI analytics for what the world watches': ["Like Polling | O que o mundo assiste, analisado por humano + IA", "Like Polling | Lo que el mundo ve, analizado por humano + IA", "Like Polling | Was die Welt schaut – analysiert von Mensch + KI", "Like Polling | Аналитика того, что смотрит мир: человек + ИИ", "Like Polling | Аналітика того, що дивиться світ: людина + ШІ", "Like Polling | 사람 + AI가 분석하는 세계가 보는 콘텐츠", "Like Polling | 人 + AI で世界が見ているものを分析"],
    'Like Polling | YouTube Channel Intelligence': ['Like Polling | Inteligência de canais do YouTube', 'Like Polling | Inteligencia de canales de YouTube', 'Like Polling | YouTube-Kanalanalyse', 'Like Polling | Аналитика YouTube-каналов', 'Like Polling | Аналітика YouTube-каналів', 'Like Polling | YouTube 채널 인텔리전스', 'Like Polling | YouTubeチャンネル分析'],
  };
  const ATTRS = ['placeholder', 'aria-label', 'title'];
  const idx = (l) => COLS.indexOf(l === 'pt-PT' ? 'pt' : l);
  // British English: the English text with British spellings.
  const gb = (s) => s.replace(/\b(analy|organi|recogni|prioriti|categori|summari|personali|optimi|reali|speciali|monetiz)z/gi, (m, a) => a + (m.slice(-1) === 'Z' ? 'S' : 's'))
    .replace(/\b(colo|favo|behavio|neighbo|labo|hono)r/gi, '$1ur').replace(/\bcenter/gi, (m) => (m[0] === 'C' ? 'Centre' : 'centre'));
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
    if (lang === 'en-GB') { const g = gb(en); return g === en ? null : g; }
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
  const browser = nav === 'pt-pt' ? 'pt-PT' : /^en-(gb|ie)$/.test(nav) ? 'en-GB' : nav.slice(0, 2);
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
