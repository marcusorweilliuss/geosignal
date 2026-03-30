const SOURCES = {
  'south-asia': [
    // ── INDIA — Mainstream ──
    { name: 'Times of India', rssUrl: 'https://timesofindia.indiatimes.com/rss/rssfeedstopstories.cms', country: ['India'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'The Hindu', rssUrl: 'https://thehindu.com/news/feeder/default.rss', country: ['India'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'NDTV', rssUrl: 'https://feeds.feedburner.com/ndtvnews-top-stories', country: ['India'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Hindustan Times', rssUrl: 'https://hindustantimes.com/rss/topnews/rssfeed.xml', country: ['India'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Indian Express', rssUrl: 'https://indianexpress.com/feed', country: ['India'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'WION', rssUrl: 'https://wionews.com/feed', country: ['India'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'ANI News', rssUrl: 'https://aninews.in/rss/', country: ['India'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'India Today', rssUrl: 'https://indiatoday.in/rss/home', country: ['India'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'News18', rssUrl: 'https://news18.com/rss/india.xml', country: ['India'], tier: 'mainstream', language: 'English', region: 'south-asia' },

    // ── INDIA — Independent Left ──
    { name: 'The Wire', rssUrl: 'https://thewire.in/feed', country: ['India'], tier: 'independent-left', language: 'English', region: 'south-asia' },
    { name: 'Scroll.in', rssUrl: 'https://scroll.in/feed', country: ['India'], tier: 'independent-left', language: 'English', region: 'south-asia' },
    { name: 'The Caravan', rssUrl: 'https://caravanmagazine.in/feed', country: ['India'], tier: 'independent-left', language: 'English', region: 'south-asia' },
    { name: 'Newslaundry', rssUrl: 'https://newslaundry.com/feed', country: ['India'], tier: 'independent-left', language: 'English', region: 'south-asia' },
    { name: 'The Print', rssUrl: 'https://theprint.in/feed', country: ['India'], tier: 'independent-left', language: 'English', region: 'south-asia' },
    { name: 'The Quint', rssUrl: 'https://thequint.com/feed', country: ['India'], tier: 'independent-left', language: 'English', region: 'south-asia' },
    { name: 'Article 14', rssUrl: 'https://article-14.com/feed', country: ['India'], tier: 'independent-left', language: 'English', region: 'south-asia' },

    // ── INDIA — Independent Right ──
    { name: 'Swarajya Magazine', rssUrl: 'https://swarajyamag.com/feed', country: ['India'], tier: 'independent-right', language: 'English', region: 'south-asia' },
    { name: 'OpIndia', rssUrl: 'https://opindia.com/feed', country: ['India'], tier: 'independent-right', language: 'English', region: 'south-asia' },
    { name: 'Republic World', rssUrl: 'https://republicworld.com/feed', country: ['India'], tier: 'independent-right', language: 'English', region: 'south-asia' },
    { name: 'Organiser', rssUrl: 'https://organiser.org/feed', country: ['India'], tier: 'independent-right', language: 'English', region: 'south-asia' },

    // ── INDIA — Regional ──
    { name: 'Deccan Herald', rssUrl: 'https://deccanherald.com/feed', country: ['India'], tier: 'regional', language: 'English', region: 'south-asia' },
    { name: 'Deccan Chronicle', rssUrl: 'https://deccanchronicle.com/feed', country: ['India'], tier: 'regional', language: 'English', region: 'south-asia' },
    { name: 'The New Indian Express', rssUrl: 'https://newindianexpress.com/feed', country: ['India'], tier: 'regional', language: 'English', region: 'south-asia' },
    { name: 'Tribune India', rssUrl: 'https://tribuneindia.com/feed', country: ['India'], tier: 'regional', language: 'English', region: 'south-asia' },
    { name: 'Telegraph India', rssUrl: 'https://telegraphindia.com/feed', country: ['India'], tier: 'regional', language: 'English', region: 'south-asia' },
    { name: 'The Statesman', rssUrl: 'https://thestatesman.com/feed', country: ['India'], tier: 'regional', language: 'English', region: 'south-asia' },
    { name: 'The Sentinel Assam', rssUrl: 'https://sentinelassam.com/feed', country: ['India'], tier: 'regional', language: 'English', region: 'south-asia' },
    { name: 'East Mojo', rssUrl: 'https://eastmojo.com/feed', country: ['India'], tier: 'regional', language: 'English', region: 'south-asia' },

    // ── INDIA — Business ──
    { name: 'Business Standard', rssUrl: 'https://business-standard.com/rss/home_page_top_stories.rss', country: ['India'], tier: 'business', language: 'English', region: 'south-asia' },
    { name: 'Mint', rssUrl: 'https://livemint.com/rss/rss.xml', country: ['India'], tier: 'business', language: 'English', region: 'south-asia' },
    { name: 'Economic Times', rssUrl: 'https://economictimes.indiatimes.com/rss.cms', country: ['India'], tier: 'business', language: 'English', region: 'south-asia' },
    { name: 'Financial Express India', rssUrl: 'https://financialexpress.com/feed', country: ['India'], tier: 'business', language: 'English', region: 'south-asia' },

    // ── INDIA — Government Official ──
    { name: 'Press Information Bureau', rssUrl: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3', country: ['India'], tier: 'government-official', language: 'English', region: 'south-asia' },
    { name: 'Ministry of External Affairs', rssUrl: 'https://mea.gov.in/press-releases.htm', country: ['India'], tier: 'government-official', language: 'English', region: 'south-asia' },
    { name: 'Ministry of Defence India', rssUrl: 'https://mod.gov.in/en/press-releases', country: ['India'], tier: 'government-official', language: 'English', region: 'south-asia' },

    // ── PAKISTAN — Mainstream ──
    { name: 'Dawn', rssUrl: 'https://dawn.com/feeds/home', country: ['Pakistan'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'The News International', rssUrl: 'https://thenews.com.pk/rss/1/1', country: ['Pakistan'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Express Tribune', rssUrl: 'https://tribune.com.pk/feed', country: ['Pakistan'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Geo News', rssUrl: 'https://geo.tv/rss', country: ['Pakistan'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'ARY News', rssUrl: 'https://arynews.tv/feed', country: ['Pakistan'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'The Nation Pakistan', rssUrl: 'https://nation.com.pk/feed', country: ['Pakistan'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Pakistan Today', rssUrl: 'https://pakistantoday.com.pk/feed', country: ['Pakistan'], tier: 'mainstream', language: 'English', region: 'south-asia' },

    // ── PAKISTAN — Independent Left ──
    { name: 'The Friday Times', rssUrl: 'https://thefridaytimes.com/feed', country: ['Pakistan'], tier: 'independent-left', language: 'English', region: 'south-asia' },
    { name: 'Daily Times Pakistan', rssUrl: 'https://dailytimes.com.pk/feed', country: ['Pakistan'], tier: 'independent-left', language: 'English', region: 'south-asia' },
    { name: 'Dawn Opinion', rssUrl: 'https://dawn.com/feeds/opinion', country: ['Pakistan'], tier: 'independent-left', language: 'English', region: 'south-asia' },

    // ── PAKISTAN — Independent Right ──
    { name: 'Pakistan Observer', rssUrl: 'https://pakobserver.net/feed', country: ['Pakistan'], tier: 'independent-right', language: 'English', region: 'south-asia' },
    { name: 'Nawa-i-Waqt English', rssUrl: 'https://nawaiwaqt.com.pk/feed', country: ['Pakistan'], tier: 'independent-right', language: 'English', region: 'south-asia' },

    // ── PAKISTAN — Business ──
    { name: 'Business Recorder', rssUrl: 'https://brecorder.com/feeds/latest-news', country: ['Pakistan'], tier: 'business', language: 'English', region: 'south-asia' },
    { name: 'The News Business', rssUrl: 'https://thenews.com.pk/rss/3/6', country: ['Pakistan'], tier: 'business', language: 'English', region: 'south-asia' },

    // ── PAKISTAN — Government Official ──
    { name: 'Ministry of Foreign Affairs Pakistan', rssUrl: 'https://mofa.gov.pk/press-releases', country: ['Pakistan'], tier: 'government-official', language: 'English', region: 'south-asia' },
    { name: 'Ministry of Finance Pakistan', rssUrl: 'https://finance.gov.pk/feed', country: ['Pakistan'], tier: 'government-official', language: 'English', region: 'south-asia' },
    { name: 'ISPR', rssUrl: 'https://ispr.gov.pk/press-release-home', country: ['Pakistan'], tier: 'government-official', language: 'English', region: 'south-asia' },

    // ── BANGLADESH — Mainstream ──
    { name: 'Daily Star Bangladesh', rssUrl: 'https://thedailystar.net/feed/news', country: ['Bangladesh'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Dhaka Tribune', rssUrl: 'https://dhakatribune.com/feed', country: ['Bangladesh'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'bdnews24 English', rssUrl: 'https://bdnews24.com/feed', country: ['Bangladesh'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'New Age Bangladesh', rssUrl: 'https://newagebd.net/feed', country: ['Bangladesh'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Daily Sun Bangladesh', rssUrl: 'https://daily-sun.com/feed', country: ['Bangladesh'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Independent Bangladesh', rssUrl: 'https://theindependentbd.com/feed', country: ['Bangladesh'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Financial Express Bangladesh', rssUrl: 'https://thefinancialexpress.com.bd/feed', country: ['Bangladesh'], tier: 'mainstream', language: 'English', region: 'south-asia' },

    // ── BANGLADESH — Independent Left ──
    { name: 'Prothom Alo English', rssUrl: 'https://en.prothomalo.com/feed', country: ['Bangladesh'], tier: 'independent-left', language: 'English', region: 'south-asia' },
    { name: 'The Business Standard Bangladesh', rssUrl: 'https://tbsnews.net/feed', country: ['Bangladesh'], tier: 'independent-left', language: 'English', region: 'south-asia' },
    { name: 'Dhaka Courier', rssUrl: 'https://dhakacourier.com.bd/feed', country: ['Bangladesh'], tier: 'independent-left', language: 'English', region: 'south-asia' },

    // ── BANGLADESH — Independent Critical ──
    { name: 'Netra News', rssUrl: 'https://netra.news/feed', country: ['Bangladesh'], tier: 'independent-critical', language: 'English', region: 'south-asia' },
    { name: 'Alal O Dulal', rssUrl: 'https://alalodulal.org/feed', country: ['Bangladesh'], tier: 'independent-critical', language: 'English', region: 'south-asia' },

    // ── BANGLADESH — Business ──
    { name: 'Bonik Barta English', rssUrl: 'https://bonikbarta.net/feed', country: ['Bangladesh'], tier: 'business', language: 'English', region: 'south-asia' },

    // ── BANGLADESH — Government Official ──
    { name: 'Bangladesh Sangbad Sangstha BSS', rssUrl: 'https://bssnews.net/feed', country: ['Bangladesh'], tier: 'government-official', language: 'English', region: 'south-asia' },
    { name: 'Ministry of Foreign Affairs Bangladesh', rssUrl: 'https://mofa.gov.bd', country: ['Bangladesh'], tier: 'government-official', language: 'English', region: 'south-asia' },
    { name: 'Ministry of Commerce Bangladesh', rssUrl: 'https://mincom.gov.bd', country: ['Bangladesh'], tier: 'government-official', language: 'English', region: 'south-asia' },

    // ── SRI LANKA — Mainstream ──
    { name: 'Daily Mirror Sri Lanka', rssUrl: 'https://dailymirror.lk/feed', country: ['Sri Lanka'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'The Island', rssUrl: 'https://island.lk/feed', country: ['Sri Lanka'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Ada Derana English', rssUrl: 'https://adaderana.lk/feed', country: ['Sri Lanka'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Colombo Gazette', rssUrl: 'https://colombogazette.com/feed', country: ['Sri Lanka'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Colombo Page', rssUrl: 'https://colombopage.com/feed', country: ['Sri Lanka'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Ceylon Today', rssUrl: 'https://ceylontoday.lk/feed', country: ['Sri Lanka'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Daily News Sri Lanka', rssUrl: 'https://dailynews.lk/feed', country: ['Sri Lanka'], tier: 'mainstream', language: 'English', region: 'south-asia' },

    // ── SRI LANKA — Independent Critical ──
    { name: 'Groundviews', rssUrl: 'https://groundviews.org/feed', country: ['Sri Lanka'], tier: 'independent-critical', language: 'English', region: 'south-asia' },
    { name: 'Lanka Business Online', rssUrl: 'https://lankabusinessonline.com/feed', country: ['Sri Lanka'], tier: 'independent-critical', language: 'English', region: 'south-asia' },

    // ── SRI LANKA — Business ──
    { name: 'Daily FT Sri Lanka', rssUrl: 'https://ft.lk/feed', country: ['Sri Lanka'], tier: 'business', language: 'English', region: 'south-asia' },

    // ── SRI LANKA — Government Official ──
    { name: 'Department of Government Information', rssUrl: 'https://dgi.gov.lk/feed', country: ['Sri Lanka'], tier: 'government-official', language: 'English', region: 'south-asia' },
    { name: 'Ministry of Foreign Affairs Sri Lanka', rssUrl: 'https://mfa.gov.lk', country: ['Sri Lanka'], tier: 'government-official', language: 'English', region: 'south-asia' },
    { name: 'Ministry of Finance Sri Lanka', rssUrl: 'https://treasury.gov.lk', country: ['Sri Lanka'], tier: 'government-official', language: 'English', region: 'south-asia' },

    // ── NEPAL — Mainstream ──
    { name: 'Kathmandu Post', rssUrl: 'https://kathmandupost.com/feed', country: ['Nepal'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'The Himalayan Times', rssUrl: 'https://thehimalayantimes.com/feed', country: ['Nepal'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Republica Nepal', rssUrl: 'https://myrepublica.nagariknetwork.com/feed', country: ['Nepal'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Gorkhapatra English', rssUrl: 'https://gorkhapatraonline.com/feed', country: ['Nepal'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Ratopati English', rssUrl: 'https://english.ratopati.com/feed', country: ['Nepal'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Khabarhub', rssUrl: 'https://khabarhub.com/feed', country: ['Nepal'], tier: 'mainstream', language: 'English', region: 'south-asia' },

    // ── NEPAL — Independent Left ──
    { name: 'Nepali Times', rssUrl: 'https://nepalitimes.com/feed', country: ['Nepal'], tier: 'independent-left', language: 'English', region: 'south-asia' },
    { name: 'OnlineKhabar English', rssUrl: 'https://english.onlinekhabar.com/feed', country: ['Nepal'], tier: 'independent-left', language: 'English', region: 'south-asia' },
    { name: 'Setopati English', rssUrl: 'https://setopati.com/feed', country: ['Nepal'], tier: 'independent-left', language: 'English', region: 'south-asia' },
    { name: 'Nepal Live Today', rssUrl: 'https://nepallivetoday.com/feed', country: ['Nepal'], tier: 'independent-left', language: 'English', region: 'south-asia' },

    // ── NEPAL — Business ──
    { name: 'New Business Age Nepal', rssUrl: 'https://newbusinessage.com/feed', country: ['Nepal'], tier: 'business', language: 'English', region: 'south-asia' },
    { name: 'Nepal Economic Forum', rssUrl: 'https://nepaleconomicforum.org/feed', country: ['Nepal'], tier: 'business', language: 'English', region: 'south-asia' },

    // ── NEPAL — Government Official ──
    { name: 'Ministry of Foreign Affairs Nepal', rssUrl: 'https://mofa.gov.np', country: ['Nepal'], tier: 'government-official', language: 'English', region: 'south-asia' },
    { name: 'Ministry of Finance Nepal', rssUrl: 'https://mof.gov.np', country: ['Nepal'], tier: 'government-official', language: 'English', region: 'south-asia' },

    // ── BHUTAN — Mainstream ──
    { name: 'Kuensel Online', rssUrl: 'https://kuenselonline.com/feed', country: ['Bhutan'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Business Bhutan', rssUrl: 'https://businessbhutan.bt/feed', country: ['Bhutan'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Bhutan Broadcasting Service', rssUrl: 'https://bbs.bt/feed', country: ['Bhutan'], tier: 'mainstream', language: 'English', region: 'south-asia' },

    // ── BHUTAN — Independent Critical ──
    { name: 'The Bhutanese', rssUrl: 'https://thebhutanese.bt/feed', country: ['Bhutan'], tier: 'independent-critical', language: 'English', region: 'south-asia' },
    { name: 'Bhutan Observer', rssUrl: 'https://bhutanobserver.bt/feed', country: ['Bhutan'], tier: 'independent-critical', language: 'English', region: 'south-asia' },
    { name: 'Bhutan Times', rssUrl: 'https://bhutantimes.bt/feed', country: ['Bhutan'], tier: 'independent-critical', language: 'English', region: 'south-asia' },

    // ── BHUTAN — Government Official ──
    { name: 'Royal Government of Bhutan', rssUrl: 'https://bhutan.gov.bt', country: ['Bhutan'], tier: 'government-official', language: 'English', region: 'south-asia' },
    { name: 'Ministry of Foreign Affairs Bhutan', rssUrl: 'https://mfa.gov.bt', country: ['Bhutan'], tier: 'government-official', language: 'English', region: 'south-asia' },

    // ── AFGHANISTAN — Mainstream ──
    { name: 'TOLOnews English', rssUrl: 'https://tolonews.com/rss.xml', country: ['Afghanistan'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Khaama Press', rssUrl: 'https://khaama.com/feed', country: ['Afghanistan'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Ariana News English', rssUrl: 'https://ariananews.af/feed', country: ['Afghanistan'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Pajhwok Afghan News', rssUrl: 'https://pajhwok.com/en/feed', country: ['Afghanistan'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Amu TV English', rssUrl: 'https://amu.tv/feed', country: ['Afghanistan'], tier: 'mainstream', language: 'English', region: 'south-asia' },

    // ── AFGHANISTAN — Independent Critical ──
    { name: 'Afghanistan Analysts Network', rssUrl: 'https://afghanistan-analysts.org/feed', country: ['Afghanistan'], tier: 'independent-critical', language: 'English', region: 'south-asia' },
    { name: 'The Afghanistan Independent', rssUrl: 'https://theafghanistanindependent.com/feed', country: ['Afghanistan'], tier: 'independent-critical', language: 'English', region: 'south-asia' },

    // ── MALDIVES — Mainstream ──
    { name: 'Maldives Independent', rssUrl: 'https://maldivesindependent.com/feed', country: ['Maldives'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'The Edition Maldives', rssUrl: 'https://edition.mv/feed', country: ['Maldives'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Sun Online Maldives', rssUrl: 'https://sun.mv/feed', country: ['Maldives'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Mihaaru English', rssUrl: 'https://en.mihaaru.com/feed', country: ['Maldives'], tier: 'mainstream', language: 'English', region: 'south-asia' },
    { name: 'Avas English', rssUrl: 'https://en.avas.mv/feed', country: ['Maldives'], tier: 'mainstream', language: 'English', region: 'south-asia' },

    // ── MALDIVES — Government Official ──
    { name: "President's Office Maldives", rssUrl: 'https://presidency.gov.mv/feed', country: ['Maldives'], tier: 'government-official', language: 'English', region: 'south-asia' },
    { name: 'Ministry of Foreign Affairs Maldives', rssUrl: 'https://foreign.gov.mv', country: ['Maldives'], tier: 'government-official', language: 'English', region: 'south-asia' },

    // ── MYANMAR — Independent Critical ──
    { name: 'The Irrawaddy English', rssUrl: 'https://irrawaddy.com/feed', country: ['Myanmar'], tier: 'independent-critical', language: 'English', region: 'south-asia' },
    { name: 'Myanmar Now', rssUrl: 'https://myanmar-now.org/en/feed', country: ['Myanmar'], tier: 'independent-critical', language: 'English', region: 'south-asia' },
    { name: 'Frontier Myanmar', rssUrl: 'https://frontiermyanmar.net/feed', country: ['Myanmar'], tier: 'independent-critical', language: 'English', region: 'south-asia' },
    { name: 'Mizzima English', rssUrl: 'https://mizzima.com/feed', country: ['Myanmar'], tier: 'independent-critical', language: 'English', region: 'south-asia' },
    { name: 'The Myanmar Times', rssUrl: 'https://mmtimes.com/feed', country: ['Myanmar'], tier: 'independent-critical', language: 'English', region: 'south-asia' },

    // ── SOUTH ASIA — Regional (multi-country) ──
    { name: 'South Asia Journal', rssUrl: 'https://southasiajournal.net/feed', country: ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Bhutan', 'Afghanistan', 'Maldives', 'Myanmar'], tier: 'regional', language: 'English', region: 'south-asia' },
    { name: 'Himal Southasian', rssUrl: 'https://himalmag.com/feed', country: ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Bhutan', 'Afghanistan', 'Maldives', 'Myanmar'], tier: 'regional', language: 'English', region: 'south-asia' },
    { name: 'The Diplomat South Asia', rssUrl: 'https://thediplomat.com/regions/south-asia/feed', country: ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Bhutan', 'Afghanistan', 'Maldives', 'Myanmar'], tier: 'regional', language: 'English', region: 'south-asia' },
    { name: 'Global Voices South Asia', rssUrl: 'https://globalvoices.org/feed', country: ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Bhutan', 'Afghanistan', 'Maldives', 'Myanmar'], tier: 'regional', language: 'English', region: 'south-asia' },
    { name: 'Asia Society Policy Institute', rssUrl: 'https://asiasociety.org/feed', country: ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Bhutan', 'Afghanistan', 'Maldives', 'Myanmar'], tier: 'regional', language: 'English', region: 'south-asia' },

    // ── SOUTH ASIA — Think Tank / Academic ──
    { name: 'Observer Research Foundation', rssUrl: 'https://orfonline.org/feed', country: ['India'], tier: 'think-tank-academic', language: 'English', region: 'south-asia' },
    { name: 'Manohar Parrikar IDSA', rssUrl: 'https://idsa.in/feed', country: ['India'], tier: 'think-tank-academic', language: 'English', region: 'south-asia' },
    { name: 'Vivekananda International Foundation', rssUrl: 'https://vifindia.org/feed', country: ['India'], tier: 'think-tank-academic', language: 'English', region: 'south-asia' },
    { name: 'Carnegie India', rssUrl: 'https://carnegieendowment.org/india/feed', country: ['India'], tier: 'think-tank-academic', language: 'English', region: 'south-asia' },
    { name: 'Centre for Policy Research India', rssUrl: 'https://cprindia.org/feed', country: ['India'], tier: 'think-tank-academic', language: 'English', region: 'south-asia' },
    { name: 'Gateway House', rssUrl: 'https://gatewayhouse.in/feed', country: ['India'], tier: 'think-tank-academic', language: 'English', region: 'south-asia' },
    { name: 'Chatham House South Asia', rssUrl: 'https://chathamhouse.org/rss/regions/south-asia', country: ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Afghanistan'], tier: 'think-tank-academic', language: 'English', region: 'south-asia' },
    { name: 'Carnegie Endowment South Asia', rssUrl: 'https://carnegieendowment.org/programs/south-asia/feed', country: ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Afghanistan'], tier: 'think-tank-academic', language: 'English', region: 'south-asia' },
    { name: 'International Crisis Group South Asia', rssUrl: 'https://crisisgroup.org/rss/asia', country: ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Afghanistan', 'Myanmar'], tier: 'think-tank-academic', language: 'English', region: 'south-asia' },
    { name: 'LSE South Asia Centre', rssUrl: 'https://feeds.feedburner.com/SouthAsia-LSE', country: ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Afghanistan'], tier: 'think-tank-academic', language: 'English', region: 'south-asia' },
    { name: 'Brookings South Asia', rssUrl: 'https://brookings.edu/feed/?topic=south-asia', country: ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Afghanistan'], tier: 'think-tank-academic', language: 'English', region: 'south-asia' },
    { name: 'RSIS Singapore', rssUrl: 'https://rsis.edu.sg/feed', country: ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Afghanistan', 'Myanmar'], tier: 'think-tank-academic', language: 'English', region: 'south-asia' },
    { name: 'East Asia Forum', rssUrl: 'https://eastasiaforum.org/feed', country: ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Afghanistan', 'Myanmar'], tier: 'think-tank-academic', language: 'English', region: 'south-asia' },
    { name: 'Wilson Center South Asia', rssUrl: 'https://wilsoncenter.org/feed', country: ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Afghanistan'], tier: 'think-tank-academic', language: 'English', region: 'south-asia' },
    { name: 'Stimson Center', rssUrl: 'https://stimson.org/feed', country: ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Afghanistan'], tier: 'think-tank-academic', language: 'English', region: 'south-asia' },
    { name: 'USIP South Asia', rssUrl: 'https://usip.org/feed', country: ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Afghanistan'], tier: 'think-tank-academic', language: 'English', region: 'south-asia' },
  ],
  'north-america': [
    // ── USA — Mainstream ──
    { name: 'New York Times', rssUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', country: ['United States'], tier: 'mainstream', language: 'English', region: 'north-america' },
    { name: 'Washington Post', rssUrl: 'https://feeds.washingtonpost.com/rss/world', country: ['United States'], tier: 'mainstream', language: 'English', region: 'north-america' },
    { name: 'Wall Street Journal', rssUrl: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml', country: ['United States'], tier: 'mainstream', language: 'English', region: 'north-america' },
    { name: 'NPR News', rssUrl: 'https://feeds.npr.org/1001/rss.xml', country: ['United States'], tier: 'mainstream', language: 'English', region: 'north-america' },
    { name: 'PBS NewsHour', rssUrl: 'https://www.pbs.org/newshour/feeds/rss/headlines', country: ['United States'], tier: 'mainstream', language: 'English', region: 'north-america' },
    { name: 'CBS News', rssUrl: 'https://www.cbsnews.com/latest/rss/main', country: ['United States'], tier: 'mainstream', language: 'English', region: 'north-america' },
    { name: 'NBC News', rssUrl: 'https://feeds.nbcnews.com/nbcnews/public/news', country: ['United States'], tier: 'mainstream', language: 'English', region: 'north-america' },
    { name: 'USA Today', rssUrl: 'https://rssfeeds.usatoday.com/usatoday-NewsTopStories', country: ['United States'], tier: 'mainstream', language: 'English', region: 'north-america' },

    // ── USA — Independent Left ──
    { name: 'The Atlantic', rssUrl: 'https://feeds.feedburner.com/TheAtlantic', country: ['United States'], tier: 'independent-left', language: 'English', region: 'north-america' },
    { name: 'Mother Jones', rssUrl: 'https://feeds.feedburner.com/motherjones/main', country: ['United States'], tier: 'independent-left', language: 'English', region: 'north-america' },
    { name: 'The Nation', rssUrl: 'https://www.thenation.com/feed/', country: ['United States'], tier: 'independent-left', language: 'English', region: 'north-america' },
    { name: 'ProPublica', rssUrl: 'https://feeds.propublica.org/propublica/main', country: ['United States'], tier: 'independent-left', language: 'English', region: 'north-america' },
    { name: 'The Intercept', rssUrl: 'https://theintercept.com/feed/?rss', country: ['United States'], tier: 'independent-left', language: 'English', region: 'north-america' },
    { name: 'Democracy Now', rssUrl: 'https://www.democracynow.org/democracynow.rss', country: ['United States'], tier: 'independent-left', language: 'English', region: 'north-america' },
    { name: 'Jacobin', rssUrl: 'https://jacobin.com/feed/', country: ['United States'], tier: 'independent-left', language: 'English', region: 'north-america' },

    // ── USA — Independent Right ──
    { name: 'National Review', rssUrl: 'https://feeds.feedburner.com/nationalreview/TEB7', country: ['United States'], tier: 'independent-right', language: 'English', region: 'north-america' },
    { name: 'The Federalist', rssUrl: 'https://thefederalist.com/feed/', country: ['United States'], tier: 'independent-right', language: 'English', region: 'north-america' },
    { name: 'Washington Examiner', rssUrl: 'https://www.washingtonexaminer.com/rss', country: ['United States'], tier: 'independent-right', language: 'English', region: 'north-america' },
    { name: 'The Daily Wire', rssUrl: 'https://www.dailywire.com/feeds/rss.xml', country: ['United States'], tier: 'independent-right', language: 'English', region: 'north-america' },
    { name: 'Reason Magazine', rssUrl: 'https://reason.com/feed/', country: ['United States'], tier: 'independent-right', language: 'English', region: 'north-america' },

    // ── USA — Business ──
    { name: 'Bloomberg', rssUrl: 'https://feeds.bloomberg.com/markets/news.rss', country: ['United States'], tier: 'business', language: 'English', region: 'north-america' },
    { name: 'Financial Times', rssUrl: 'https://www.ft.com/rss/home', country: ['United States'], tier: 'business', language: 'English', region: 'north-america' },
    { name: 'CNBC', rssUrl: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', country: ['United States'], tier: 'business', language: 'English', region: 'north-america' },
    { name: 'Forbes', rssUrl: 'https://www.forbes.com/real-time/feed2/', country: ['United States'], tier: 'business', language: 'English', region: 'north-america' },
    { name: 'The Economist', rssUrl: 'https://www.economist.com/latest/rss.xml', country: ['United States'], tier: 'business', language: 'English', region: 'north-america' },

    // ── CANADA — Mainstream ──
    { name: 'Globe and Mail', rssUrl: 'https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/canada/', country: ['Canada'], tier: 'mainstream', language: 'English', region: 'north-america' },
    { name: 'CBC News', rssUrl: 'https://rss.cbc.ca/lineup/topstories.xml', country: ['Canada'], tier: 'mainstream', language: 'English', region: 'north-america' },
    { name: 'Toronto Star', rssUrl: 'https://www.thestar.com/content/thestar/feed.RSSManagerServlet.topstories.rss', country: ['Canada'], tier: 'mainstream', language: 'English', region: 'north-america' },
    { name: 'National Post', rssUrl: 'https://nationalpost.com/feed/', country: ['Canada'], tier: 'mainstream', language: 'English', region: 'north-america' },
    { name: 'CTV News', rssUrl: 'https://www.ctvnews.ca/rss/ctvnews-ca-top-stories-public-rss-1.822009', country: ['Canada'], tier: 'mainstream', language: 'English', region: 'north-america' },

    // ── CANADA — Independent Left ──
    { name: "Maclean's", rssUrl: 'https://www.macleans.ca/feed/', country: ['Canada'], tier: 'independent-left', language: 'English', region: 'north-america' },
    { name: 'The Walrus', rssUrl: 'https://thewalrus.ca/feed/', country: ['Canada'], tier: 'independent-left', language: 'English', region: 'north-america' },
    { name: 'iPolitics', rssUrl: 'https://ipolitics.ca/feed/', country: ['Canada'], tier: 'independent-left', language: 'English', region: 'north-america' },

    // ── MEXICO — Mainstream ──
    { name: 'Mexico News Daily', rssUrl: 'https://mexiconewsdaily.com/feed/', country: ['Mexico'], tier: 'mainstream', language: 'English', region: 'north-america' },
    { name: 'El Universal English', rssUrl: 'https://www.eluniversal.com.mx/rss.xml', country: ['Mexico'], tier: 'mainstream', language: 'English', region: 'north-america' },

    // ── MEXICO — Independent Critical ──
    { name: 'Animal Político', rssUrl: 'https://www.animalpolitico.com/feed/', country: ['Mexico'], tier: 'independent-critical', language: 'English', region: 'north-america' },
    { name: 'Proceso', rssUrl: 'https://www.proceso.com.mx/rss/', country: ['Mexico'], tier: 'independent-critical', language: 'English', region: 'north-america' },

    // ── USA/CANADA/MEXICO — Government Official ──
    { name: 'White House Press Releases', rssUrl: 'https://www.whitehouse.gov/feed/', country: ['United States'], tier: 'government-official', language: 'English', region: 'north-america' },
    { name: 'US State Department', rssUrl: 'https://www.state.gov/rss-feeds/', country: ['United States'], tier: 'government-official', language: 'English', region: 'north-america' },
    { name: 'US Department of Defense', rssUrl: 'https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=10', country: ['United States'], tier: 'government-official', language: 'English', region: 'north-america' },
    { name: 'US Trade Representative', rssUrl: 'https://ustr.gov/rss.xml', country: ['United States'], tier: 'government-official', language: 'English', region: 'north-america' },
    { name: 'Government of Canada News', rssUrl: 'https://www.canada.ca/en/news.atom', country: ['Canada'], tier: 'government-official', language: 'English', region: 'north-america' },
    { name: 'Global Affairs Canada', rssUrl: 'https://www.canada.ca/en/global-affairs.atom', country: ['Canada'], tier: 'government-official', language: 'English', region: 'north-america' },
    { name: 'Mexican Foreign Ministry', rssUrl: 'https://www.gob.mx/sre/rss', country: ['Mexico'], tier: 'government-official', language: 'English', region: 'north-america' },

    // ── North America — Think Tank / Academic ──
    { name: 'Council on Foreign Relations', rssUrl: 'https://www.cfr.org/rss.xml', country: ['United States'], tier: 'think-tank-academic', language: 'English', region: 'north-america' },
    { name: 'Brookings Institution', rssUrl: 'https://www.brookings.edu/feed/', country: ['United States'], tier: 'think-tank-academic', language: 'English', region: 'north-america' },
    { name: 'CATO Institute', rssUrl: 'https://feeds.cato.org/CatoRecentOpeds', country: ['United States'], tier: 'think-tank-academic', language: 'English', region: 'north-america' },
    { name: 'Center for American Progress', rssUrl: 'https://www.americanprogress.org/feed/', country: ['United States'], tier: 'think-tank-academic', language: 'English', region: 'north-america' },
    { name: 'RAND Corporation', rssUrl: 'https://www.rand.org/feeds/rand-all.xml', country: ['United States'], tier: 'think-tank-academic', language: 'English', region: 'north-america' },
    { name: 'Wilson Center', rssUrl: 'https://www.wilsoncenter.org/feed', country: ['United States'], tier: 'think-tank-academic', language: 'English', region: 'north-america' },
    { name: 'Atlantic Council', rssUrl: 'https://www.atlanticcouncil.org/feed/', country: ['United States'], tier: 'think-tank-academic', language: 'English', region: 'north-america' },
    { name: 'CSIS', rssUrl: 'https://www.csis.org/feed', country: ['United States'], tier: 'think-tank-academic', language: 'English', region: 'north-america' },
    { name: 'Carnegie Endowment', rssUrl: 'https://carnegieendowment.org/feed/', country: ['United States'], tier: 'think-tank-academic', language: 'English', region: 'north-america' },
    { name: 'Heritage Foundation', rssUrl: 'https://feeds.feedburner.com/TheFoundry', country: ['United States'], tier: 'think-tank-academic', language: 'English', region: 'north-america' },
  ],
  'latin-america': [
    // ── Regional / Pan-Latin — Mainstream ──
    { name: 'Reuters Latin America', rssUrl: 'https://feeds.reuters.com/reuters/latinamericaNews', country: ['Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Venezuela'], tier: 'mainstream', language: 'English', region: 'latin-america' },
    { name: 'BBC Latin America', rssUrl: 'https://feeds.bbci.co.uk/news/world/latin_america/rss.xml', country: ['Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Venezuela'], tier: 'mainstream', language: 'English', region: 'latin-america' },
    { name: 'Agencia EFE English', rssUrl: 'https://www.efe.com/efe/english/rss', country: ['Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Venezuela'], tier: 'mainstream', language: 'English', region: 'latin-america' },
    { name: 'Merco Press', rssUrl: 'https://en.mercopress.com/rss', country: ['Argentina', 'Brazil', 'Uruguay', 'Paraguay', 'Chile'], tier: 'mainstream', language: 'English', region: 'latin-america' },

    // ── BRAZIL — Mainstream ──
    { name: 'Agência Brasil English', rssUrl: 'https://agenciabrasil.ebc.com.br/en/rss', country: ['Brazil'], tier: 'mainstream', language: 'English', region: 'latin-america' },
    { name: 'The Brazilian Report', rssUrl: 'https://brazilian.report/feed/', country: ['Brazil'], tier: 'mainstream', language: 'English', region: 'latin-america' },

    // ── BRAZIL — Independent Critical ──
    { name: 'The Intercept Brasil', rssUrl: 'https://theintercept.com/brasil/feed/?rss', country: ['Brazil'], tier: 'independent-critical', language: 'English', region: 'latin-america' },
    { name: 'Agência Pública', rssUrl: 'https://apublica.org/feed/', country: ['Brazil'], tier: 'independent-critical', language: 'English', region: 'latin-america' },

    // ── ARGENTINA — Mainstream ──
    { name: 'Buenos Aires Herald', rssUrl: 'https://www.buenosairesherald.com/feed/', country: ['Argentina'], tier: 'mainstream', language: 'English', region: 'latin-america' },
    { name: 'Infobae English', rssUrl: 'https://www.infobae.com/feeds/rss/', country: ['Argentina'], tier: 'mainstream', language: 'English', region: 'latin-america' },
    { name: 'MercoPress Argentina', rssUrl: 'https://en.mercopress.com/rss', country: ['Argentina'], tier: 'mainstream', language: 'English', region: 'latin-america' },

    // ── COLOMBIA — Mainstream ──
    { name: 'Colombia Reports', rssUrl: 'https://colombiareports.com/feed/', country: ['Colombia'], tier: 'mainstream', language: 'English', region: 'latin-america' },

    // ── COLOMBIA — Independent Critical ──
    { name: 'La Silla Vacía', rssUrl: 'https://lasillavacia.com/feed', country: ['Colombia'], tier: 'independent-critical', language: 'English', region: 'latin-america' },

    // ── VENEZUELA — Independent Critical ──
    { name: 'Caracas Chronicles', rssUrl: 'https://www.caracaschronicles.com/feed/', country: ['Venezuela'], tier: 'independent-critical', language: 'English', region: 'latin-america' },

    // ── CHILE — Mainstream ──
    { name: 'Santiago Times', rssUrl: 'https://santiagotimes.cl/feed/', country: ['Chile'], tier: 'mainstream', language: 'English', region: 'latin-america' },

    // ── CARIBBEAN — Mainstream ──
    { name: 'Caribbean Journal', rssUrl: 'https://caribjournal.com/feed/', country: ['Jamaica', 'Trinidad and Tobago', 'Dominican Republic', 'Haiti', 'Cuba'], tier: 'mainstream', language: 'English', region: 'latin-america' },
    { name: 'Jamaica Observer', rssUrl: 'https://www.jamaicaobserver.com/rss', country: ['Jamaica'], tier: 'mainstream', language: 'English', region: 'latin-america' },
    { name: 'Trinidad Express', rssUrl: 'https://www.trinidadexpress.com/feed/', country: ['Trinidad and Tobago'], tier: 'mainstream', language: 'English', region: 'latin-america' },

    // ── CENTRAL AMERICA — Independent Critical ──
    { name: 'El Faro English', rssUrl: 'https://elfaro.net/feed', country: ['El Salvador'], tier: 'independent-critical', language: 'English', region: 'latin-america' },
    { name: 'Confidencial Nicaragua', rssUrl: 'https://confidencial.digital/feed/', country: ['Nicaragua'], tier: 'independent-critical', language: 'English', region: 'latin-america' },

    // ── Latin America — Business ──
    { name: 'Americas Quarterly', rssUrl: 'https://www.americasquarterly.org/feed/', country: ['Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Venezuela'], tier: 'business', language: 'English', region: 'latin-america' },
    { name: 'BNamericas', rssUrl: 'https://www.bnamericas.com/rss', country: ['Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile', 'Peru'], tier: 'business', language: 'English', region: 'latin-america' },
    { name: 'Latin Finance', rssUrl: 'https://www.latinfinance.com/feed', country: ['Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile', 'Peru'], tier: 'business', language: 'English', region: 'latin-america' },

    // ── Latin America — Government Official ──
    { name: 'Brazilian Government News', rssUrl: 'https://www.gov.br/en/latest-news/rss', country: ['Brazil'], tier: 'government-official', language: 'English', region: 'latin-america' },
    { name: 'Brazilian Ministry of Foreign Affairs', rssUrl: 'https://www.gov.br/mre/en/rss', country: ['Brazil'], tier: 'government-official', language: 'English', region: 'latin-america' },
    { name: 'Argentine Foreign Ministry', rssUrl: 'https://www.cancilleria.gob.ar/en/rss', country: ['Argentina'], tier: 'government-official', language: 'English', region: 'latin-america' },
    { name: 'Colombian Foreign Ministry', rssUrl: 'https://www.cancilleria.gov.co/rss', country: ['Colombia'], tier: 'government-official', language: 'English', region: 'latin-america' },

    // ── Latin America — Think Tank / Academic ──
    { name: 'Inter-American Dialogue', rssUrl: 'https://www.thedialogue.org/feed/', country: ['Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Venezuela'], tier: 'think-tank-academic', language: 'English', region: 'latin-america' },
    { name: 'WOLA', rssUrl: 'https://www.wola.org/feed/', country: ['Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Venezuela'], tier: 'think-tank-academic', language: 'English', region: 'latin-america' },
    { name: 'NACLA Report', rssUrl: 'https://nacla.org/feed', country: ['Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Venezuela'], tier: 'think-tank-academic', language: 'English', region: 'latin-america' },
    { name: 'Council on Hemispheric Affairs', rssUrl: 'https://www.coha.org/feed/', country: ['Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Venezuela'], tier: 'think-tank-academic', language: 'English', region: 'latin-america' },
    { name: 'International Crisis Group Latin America', rssUrl: 'https://www.crisisgroup.org/rss/latin-america', country: ['Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Venezuela'], tier: 'think-tank-academic', language: 'English', region: 'latin-america' },
    { name: 'IISS Latin America', rssUrl: 'https://www.iiss.org/rss/latin-america', country: ['Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Venezuela'], tier: 'think-tank-academic', language: 'English', region: 'latin-america' },
  ],
  'central-asia-caucasus': [
    // ── Regional — Mainstream ──
    { name: 'Eurasianet', rssUrl: 'https://eurasianet.org/feed', country: ['Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Azerbaijan', 'Armenia', 'Georgia'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },
    { name: 'RFE/RL Central Asia', rssUrl: 'https://www.rferl.org/api/zncjqmveiy', country: ['Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },
    { name: 'The Diplomat Central Asia', rssUrl: 'https://thediplomat.com/regions/central-asia/feed', country: ['Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },
    { name: 'Times of Central Asia', rssUrl: 'https://timesca.com/feed/', country: ['Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },
    { name: 'Central Asia-Caucasus Analyst', rssUrl: 'https://cacianalyst.org/feed/', country: ['Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Azerbaijan', 'Armenia', 'Georgia'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },
    { name: 'News Central Asia', rssUrl: 'https://www.newscentralasia.net/feed/', country: ['Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },
    { name: 'Silk Road Briefing', rssUrl: 'https://www.silkroadbriefing.com/news/feed', country: ['Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },

    // ── KAZAKHSTAN — Mainstream ──
    { name: 'Kazinform English', rssUrl: 'https://www.inform.kz/en/rss', country: ['Kazakhstan'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },
    { name: 'Tengrinews English', rssUrl: 'https://en.tengrinews.kz/rss', country: ['Kazakhstan'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },
    { name: 'Astana Times', rssUrl: 'https://astanatimes.com/feed/', country: ['Kazakhstan'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },

    // ── UZBEKISTAN — Mainstream ──
    { name: 'Kun.uz English', rssUrl: 'https://kun.uz/en/rss.xml', country: ['Uzbekistan'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },
    { name: 'UzDaily', rssUrl: 'https://www.uzdaily.uz/en/rss', country: ['Uzbekistan'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },

    // ── KYRGYZSTAN — Mainstream ──
    { name: '24.kg English', rssUrl: 'https://24.kg/english/rss', country: ['Kyrgyzstan'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },
    { name: 'Kabar English', rssUrl: 'https://kabar.kg/rss', country: ['Kyrgyzstan'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },

    // ── TAJIKISTAN — Mainstream ──
    { name: 'Asia-Plus', rssUrl: 'https://asiaplus.tj/en/rss', country: ['Tajikistan'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },
    { name: 'Radio Ozodi', rssUrl: 'https://www.ozodi.org/api/zpcjqmveiy', country: ['Tajikistan'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },

    // ── TURKMENISTAN — Independent Critical ──
    { name: 'Turkmen News', rssUrl: 'https://en.turkmen.news/rss', country: ['Turkmenistan'], tier: 'independent-critical', language: 'English', region: 'central-asia-caucasus' },
    { name: 'Chronicles of Turkmenistan', rssUrl: 'https://en.hronikatm.com/feed/', country: ['Turkmenistan'], tier: 'independent-critical', language: 'English', region: 'central-asia-caucasus' },

    // ── AZERBAIJAN — Mainstream ──
    { name: 'AzVision', rssUrl: 'https://azvision.az/rss.xml', country: ['Azerbaijan'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },
    { name: 'Trend News Agency', rssUrl: 'https://en.trend.az/rss', country: ['Azerbaijan'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },
    { name: 'Baku Tribune', rssUrl: 'https://bakutribune.com/feed', country: ['Azerbaijan'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },
    { name: 'JAM News', rssUrl: 'https://jam-news.net/feed/', country: ['Azerbaijan', 'Armenia', 'Georgia'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },

    // ── ARMENIA — Mainstream ──
    { name: 'Armenpress', rssUrl: 'https://armenpress.am/eng/rss', country: ['Armenia'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },
    { name: 'ArmInfo', rssUrl: 'https://arminfo.info/en/rss', country: ['Armenia'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },

    // ── ARMENIA — Independent Left ──
    { name: 'EVN Report', rssUrl: 'https://evnreport.com/feed/', country: ['Armenia'], tier: 'independent-left', language: 'English', region: 'central-asia-caucasus' },
    { name: 'RFE/RL Armenia', rssUrl: 'https://www.azatutyun.am/api/zmcjqmveiy', country: ['Armenia'], tier: 'independent-left', language: 'English', region: 'central-asia-caucasus' },

    // ── GEORGIA — Mainstream ──
    { name: 'Georgia Today', rssUrl: 'https://georgiatoday.ge/rss', country: ['Georgia'], tier: 'mainstream', language: 'English', region: 'central-asia-caucasus' },

    // ── GEORGIA — Independent Critical ──
    { name: 'Civil.ge', rssUrl: 'https://civil.ge/feed', country: ['Georgia'], tier: 'independent-critical', language: 'English', region: 'central-asia-caucasus' },
    { name: 'OC Media', rssUrl: 'https://oc-media.org/feed/', country: ['Georgia', 'Armenia', 'Azerbaijan'], tier: 'independent-critical', language: 'English', region: 'central-asia-caucasus' },
    { name: 'RFE/RL Georgia', rssUrl: 'https://www.radiotavisupleba.ge/api/zocjqmveiy', country: ['Georgia'], tier: 'independent-critical', language: 'English', region: 'central-asia-caucasus' },

    // ── Regional — Independent Critical ──
    { name: 'CABAR.asia', rssUrl: 'https://cabar.asia/en/feed/', country: ['Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan'], tier: 'independent-critical', language: 'English', region: 'central-asia-caucasus' },
    { name: 'Fergana News', rssUrl: 'https://fergana.agency/en/feed/', country: ['Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan'], tier: 'independent-critical', language: 'English', region: 'central-asia-caucasus' },
    { name: 'The Oxus Society', rssUrl: 'https://oxussociety.org/feed', country: ['Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan'], tier: 'independent-critical', language: 'English', region: 'central-asia-caucasus' },

    // ── Regional — Government Official ──
    { name: 'Kazakhstan MFA', rssUrl: 'https://www.gov.kz/en/news', country: ['Kazakhstan'], tier: 'government-official', language: 'English', region: 'central-asia-caucasus' },
    { name: 'Uzbekistan MFA', rssUrl: 'https://mfa.uz/en/press/news/rss', country: ['Uzbekistan'], tier: 'government-official', language: 'English', region: 'central-asia-caucasus' },
    { name: 'Azerbaijan MFA', rssUrl: 'https://mfa.gov.az/en/news/rss', country: ['Azerbaijan'], tier: 'government-official', language: 'English', region: 'central-asia-caucasus' },
    { name: 'Armenia MFA', rssUrl: 'https://www.mfa.am/en/press-releases/rss', country: ['Armenia'], tier: 'government-official', language: 'English', region: 'central-asia-caucasus' },
    { name: 'Georgia MFA', rssUrl: 'https://mfa.gov.ge/en/news/rss', country: ['Georgia'], tier: 'government-official', language: 'English', region: 'central-asia-caucasus' },

    // ── Regional — Think Tank / Academic ──
    { name: 'PONARS Eurasia', rssUrl: 'https://www.ponarseurasia.org/feed/', country: ['Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Azerbaijan', 'Armenia', 'Georgia'], tier: 'think-tank-academic', language: 'English', region: 'central-asia-caucasus' },
    { name: 'Carnegie Europe', rssUrl: 'https://carnegieeurope.eu/feed/', country: ['Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Azerbaijan', 'Armenia', 'Georgia'], tier: 'think-tank-academic', language: 'English', region: 'central-asia-caucasus' },
    { name: 'German Marshall Fund', rssUrl: 'https://www.gmfus.org/feed', country: ['Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Azerbaijan', 'Armenia', 'Georgia'], tier: 'think-tank-academic', language: 'English', region: 'central-asia-caucasus' },
    { name: 'IISS Eurasia', rssUrl: 'https://www.iiss.org/rss/eurasia', country: ['Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Azerbaijan', 'Armenia', 'Georgia'], tier: 'think-tank-academic', language: 'English', region: 'central-asia-caucasus' },
    { name: 'International Crisis Group Central Asia', rssUrl: 'https://www.crisisgroup.org/rss/asia', country: ['Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Azerbaijan', 'Armenia', 'Georgia'], tier: 'think-tank-academic', language: 'English', region: 'central-asia-caucasus' },
  ],
  'middle-east': [
    // ── Regional — Mainstream ──
    { name: 'Al Jazeera English', rssUrl: 'https://www.aljazeera.com/xml/rss/all.xml', country: ['Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Turkey', 'Israel', 'Palestine', 'Jordan', 'Lebanon', 'Syria', 'Yemen', 'Qatar', 'Egypt'], tier: 'mainstream', language: 'English', region: 'middle-east' },
    { name: 'Middle East Eye', rssUrl: 'https://www.middleeasteye.net/rss', country: ['Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Turkey', 'Israel', 'Palestine', 'Jordan', 'Lebanon', 'Syria', 'Yemen', 'Qatar', 'Egypt'], tier: 'mainstream', language: 'English', region: 'middle-east' },
    { name: 'The National UAE', rssUrl: 'https://www.thenationalnews.com/rss', country: ['UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman'], tier: 'mainstream', language: 'English', region: 'middle-east' },
    { name: 'Arab News', rssUrl: 'https://www.arabnews.com/rss.xml', country: ['Saudi Arabia', 'UAE', 'Qatar', 'Kuwait', 'Bahrain', 'Oman'], tier: 'mainstream', language: 'English', region: 'middle-east' },
    { name: 'Al Monitor', rssUrl: 'https://feeds.feedburner.com/al-monitor/frontpage', country: ['Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Turkey', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Egypt'], tier: 'mainstream', language: 'English', region: 'middle-east' },
    { name: 'Reuters Middle East', rssUrl: 'https://feeds.reuters.com/reuters/middleeastNews', country: ['Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Turkey', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Yemen', 'Egypt'], tier: 'mainstream', language: 'English', region: 'middle-east' },
    { name: 'BBC Middle East', rssUrl: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml', country: ['Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Turkey', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Yemen', 'Egypt'], tier: 'mainstream', language: 'English', region: 'middle-east' },
    { name: 'Haaretz English', rssUrl: 'https://www.haaretz.com/cmlink/1.628765', country: ['Israel', 'Palestine'], tier: 'mainstream', language: 'English', region: 'middle-east' },
    { name: 'The New Arab', rssUrl: 'https://www.newarab.com/feed', country: ['Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Turkey', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Yemen', 'Egypt'], tier: 'mainstream', language: 'English', region: 'middle-east' },

    // ── Regional — Independent Critical ──
    { name: '+972 Magazine', rssUrl: 'https://972mag.com/feed/', country: ['Israel', 'Palestine'], tier: 'independent-critical', language: 'English', region: 'middle-east' },
    { name: 'Mondoweiss', rssUrl: 'https://mondoweiss.net/feed/', country: ['Israel', 'Palestine'], tier: 'independent-critical', language: 'English', region: 'middle-east' },
    { name: 'Jadaliyya', rssUrl: 'https://www.jadaliyya.com/feed/', country: ['Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Turkey', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Egypt'], tier: 'independent-critical', language: 'English', region: 'middle-east' },
    { name: 'MEE Opinion', rssUrl: 'https://www.middleeasteye.net/rss/opinion', country: ['Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Turkey', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Yemen', 'Egypt'], tier: 'independent-critical', language: 'English', region: 'middle-east' },

    // ── TURKEY — Mainstream ──
    { name: 'Hurriyet Daily News', rssUrl: 'https://www.hurriyetdailynews.com/rss', country: ['Turkey'], tier: 'mainstream', language: 'English', region: 'middle-east' },
    { name: 'Daily Sabah', rssUrl: 'https://www.dailysabah.com/rss', country: ['Turkey'], tier: 'mainstream', language: 'English', region: 'middle-east' },

    // ── TURKEY — Independent Critical ──
    { name: 'Bianet English', rssUrl: 'https://bianet.org/english/rss', country: ['Turkey'], tier: 'independent-critical', language: 'English', region: 'middle-east' },
    { name: 'Cumhuriyet English', rssUrl: 'https://www.cumhuriyet.com.tr/rss/en', country: ['Turkey'], tier: 'independent-critical', language: 'English', region: 'middle-east' },

    // ── IRAN — Independent Critical ──
    { name: 'Iran International', rssUrl: 'https://www.iranintl.com/en/rss', country: ['Iran'], tier: 'independent-critical', language: 'English', region: 'middle-east' },
    { name: 'Radio Farda', rssUrl: 'https://www.radiofarda.com/api/zqcjqmveiy', country: ['Iran'], tier: 'independent-critical', language: 'English', region: 'middle-east' },
    { name: 'IranWire', rssUrl: 'https://iranwire.com/feed/', country: ['Iran'], tier: 'independent-critical', language: 'English', region: 'middle-east' },

    // ── IRAN — Government Official ──
    { name: 'IRNA State Agency', rssUrl: 'https://en.irna.ir/rss', country: ['Iran'], tier: 'government-official', language: 'English', region: 'middle-east' },
    { name: 'Tehran Times', rssUrl: 'https://www.tehrantimes.com/rss', country: ['Iran'], tier: 'government-official', language: 'English', region: 'middle-east' },

    // ── EGYPT — Mainstream ──
    { name: 'Ahram Online', rssUrl: 'https://english.ahram.org.eg/RSS.aspx', country: ['Egypt'], tier: 'mainstream', language: 'English', region: 'middle-east' },
    { name: 'Egypt Independent', rssUrl: 'https://www.egyptindependent.com/feed/', country: ['Egypt'], tier: 'mainstream', language: 'English', region: 'middle-east' },

    // ── EGYPT — Independent Critical ──
    { name: 'Mada Masr', rssUrl: 'https://madamasr.com/en/feed/', country: ['Egypt'], tier: 'independent-critical', language: 'English', region: 'middle-east' },

    // ── IRAQ — Mainstream ──
    { name: 'Rudaw English', rssUrl: 'https://www.rudaw.net/rss/english', country: ['Iraq'], tier: 'mainstream', language: 'English', region: 'middle-east' },
    { name: 'Iraq Oil Report', rssUrl: 'https://www.iraqoilreport.com/feed/', country: ['Iraq'], tier: 'mainstream', language: 'English', region: 'middle-east' },

    // ── LEBANON — Mainstream ──
    { name: "L'Orient Today", rssUrl: 'https://lorientlejour.com/en/feed', country: ['Lebanon'], tier: 'mainstream', language: 'English', region: 'middle-east' },
    { name: 'Naharnet', rssUrl: 'https://www.naharnet.com/stories/en/rss', country: ['Lebanon'], tier: 'mainstream', language: 'English', region: 'middle-east' },

    // ── ISRAEL/PALESTINE — Mainstream ──
    { name: 'Times of Israel', rssUrl: 'https://www.timesofisrael.com/feed/', country: ['Israel', 'Palestine'], tier: 'mainstream', language: 'English', region: 'middle-east' },
    { name: 'Jerusalem Post', rssUrl: 'https://www.jpost.com/Rss/RssFeedsHeadlines.aspx', country: ['Israel', 'Palestine'], tier: 'mainstream', language: 'English', region: 'middle-east' },

    // ── SAUDI ARABIA / GULF — Mainstream ──
    { name: 'Gulf News', rssUrl: 'https://gulfnews.com/rss', country: ['UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman'], tier: 'mainstream', language: 'English', region: 'middle-east' },
    { name: 'Saudi Gazette', rssUrl: 'https://saudigazette.com.sa/feed', country: ['Saudi Arabia'], tier: 'mainstream', language: 'English', region: 'middle-east' },
    { name: 'Khaleej Times', rssUrl: 'https://www.khaleejtimes.com/rss', country: ['UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman'], tier: 'mainstream', language: 'English', region: 'middle-east' },

    // ── NORTH AFRICA — Mainstream ──
    { name: 'Morocco World News', rssUrl: 'https://www.moroccoworldnews.com/feed/', country: ['Morocco'], tier: 'mainstream', language: 'English', region: 'middle-east' },
    { name: 'Libya Observer', rssUrl: 'https://libyaobserver.ly/feed', country: ['Libya'], tier: 'mainstream', language: 'English', region: 'middle-east' },
    { name: 'Algeria Press Service', rssUrl: 'https://www.aps.dz/en/rss', country: ['Algeria'], tier: 'mainstream', language: 'English', region: 'middle-east' },

    // ── YEMEN — Independent Critical ──
    { name: 'Yemen Monitor', rssUrl: 'https://yemenmonitor.com/feed', country: ['Yemen'], tier: 'independent-critical', language: 'English', region: 'middle-east' },

    // ── Middle East — Business ──
    { name: 'Gulf Business', rssUrl: 'https://gulfbusiness.com/feed/', country: ['UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman'], tier: 'business', language: 'English', region: 'middle-east' },
    { name: 'Zawya', rssUrl: 'https://www.zawya.com/rss', country: ['UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman'], tier: 'business', language: 'English', region: 'middle-east' },
    { name: 'MEED', rssUrl: 'https://www.meed.com/rss', country: ['UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman'], tier: 'business', language: 'English', region: 'middle-east' },

    // ── Middle East — Government Official ──
    { name: 'Saudi Press Agency', rssUrl: 'https://www.spa.gov.sa/rss.php', country: ['Saudi Arabia'], tier: 'government-official', language: 'English', region: 'middle-east' },
    { name: 'Qatar News Agency', rssUrl: 'https://www.qna.org.qa/en/rss', country: ['Qatar'], tier: 'government-official', language: 'English', region: 'middle-east' },
    { name: 'Turkish Foreign Ministry', rssUrl: 'https://www.mfa.gov.tr/rss.en.mfa', country: ['Turkey'], tier: 'government-official', language: 'English', region: 'middle-east' },
    { name: 'UAE Government News', rssUrl: 'https://www.uaecabinet.ae/en/rss', country: ['UAE'], tier: 'government-official', language: 'English', region: 'middle-east' },
    { name: 'Israeli Government Press', rssUrl: 'https://www.gov.il/en/departments/news/rss', country: ['Israel'], tier: 'government-official', language: 'English', region: 'middle-east' },
    { name: 'Egyptian MENA State Agency', rssUrl: 'https://www.mena.org.eg/en/rss', country: ['Egypt'], tier: 'government-official', language: 'English', region: 'middle-east' },

    // ── Middle East — Think Tank / Academic ──
    { name: 'Middle East Institute', rssUrl: 'https://www.mei.edu/feed/', country: ['Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Turkey', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Yemen', 'Egypt'], tier: 'think-tank-academic', language: 'English', region: 'middle-east' },
    { name: 'Chatham House MENA', rssUrl: 'https://www.chathamhouse.org/rss/regions/middle-east-north-africa', country: ['Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Turkey', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Yemen', 'Egypt'], tier: 'think-tank-academic', language: 'English', region: 'middle-east' },
    { name: 'Carnegie Middle East', rssUrl: 'https://carnegieendowment.org/middle-east/feed/', country: ['Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Turkey', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Yemen', 'Egypt'], tier: 'think-tank-academic', language: 'English', region: 'middle-east' },
    { name: 'Washington Institute for Near East Policy', rssUrl: 'https://www.washingtoninstitute.org/rss', country: ['Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Turkey', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Egypt'], tier: 'think-tank-academic', language: 'English', region: 'middle-east' },
    { name: 'International Crisis Group MENA', rssUrl: 'https://www.crisisgroup.org/rss/middle-east-north-africa', country: ['Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Turkey', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Yemen', 'Egypt', 'Libya', 'Tunisia', 'Morocco', 'Algeria'], tier: 'think-tank-academic', language: 'English', region: 'middle-east' },
    { name: 'Brookings Doha', rssUrl: 'https://www.brookings.edu/feed/?region=middle-east', country: ['Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Turkey', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Yemen', 'Qatar', 'Egypt'], tier: 'think-tank-academic', language: 'English', region: 'middle-east' },
    { name: 'IISS MENA', rssUrl: 'https://www.iiss.org/rss/middle-east-north-africa', country: ['Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Turkey', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Yemen', 'Egypt'], tier: 'think-tank-academic', language: 'English', region: 'middle-east' },
    { name: 'Arab Reform Initiative', rssUrl: 'https://www.arab-reform.net/feed/', country: ['Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Turkey', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Yemen', 'Egypt', 'Tunisia', 'Morocco', 'Algeria'], tier: 'think-tank-academic', language: 'English', region: 'middle-east' },
    { name: 'Stimson Center MENA', rssUrl: 'https://www.stimson.org/feed', country: ['Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Turkey', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Yemen', 'Egypt'], tier: 'think-tank-academic', language: 'English', region: 'middle-east' },
  ],
  'europe': [
    // ── Pan-European — Mainstream ──
    { name: 'BBC World', rssUrl: 'https://feeds.bbci.co.uk/news/world/rss.xml', country: ['UK', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Poland', 'Ukraine', 'Russia'], tier: 'mainstream', language: 'English', region: 'europe' },
    { name: 'Reuters Europe', rssUrl: 'https://feeds.reuters.com/reuters/europeNews', country: ['UK', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Poland', 'Ukraine', 'Russia'], tier: 'mainstream', language: 'English', region: 'europe' },
    { name: 'Euronews', rssUrl: 'https://www.euronews.com/rss', country: ['UK', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Poland', 'Ukraine'], tier: 'mainstream', language: 'English', region: 'europe' },
    { name: 'Politico Europe', rssUrl: 'https://www.politico.eu/feed/', country: ['UK', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Belgium', 'Poland'], tier: 'mainstream', language: 'English', region: 'europe' },
    { name: 'EUobserver', rssUrl: 'https://euobserver.com/rss', country: ['Belgium', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Poland'], tier: 'mainstream', language: 'English', region: 'europe' },
    { name: 'Deutsche Welle', rssUrl: 'https://rss.dw.com/xml/rss-en-all', country: ['Germany', 'UK', 'France', 'Italy', 'Spain', 'Poland', 'Ukraine', 'Russia'], tier: 'mainstream', language: 'English', region: 'europe' },
    { name: 'France 24 English', rssUrl: 'https://www.france24.com/en/rss', country: ['France', 'UK', 'Germany', 'Italy', 'Spain', 'Poland', 'Ukraine'], tier: 'mainstream', language: 'English', region: 'europe' },
    { name: 'RFI English', rssUrl: 'https://www.rfi.fr/en/rss', country: ['France', 'UK', 'Germany', 'Italy', 'Spain', 'Poland', 'Ukraine'], tier: 'mainstream', language: 'English', region: 'europe' },

    // ── UK — Mainstream ──
    { name: 'The Guardian', rssUrl: 'https://www.theguardian.com/world/rss', country: ['UK'], tier: 'mainstream', language: 'English', region: 'europe' },
    { name: 'Financial Times UK', rssUrl: 'https://www.ft.com/rss/home/uk', country: ['UK'], tier: 'mainstream', language: 'English', region: 'europe' },
    { name: 'The Times UK', rssUrl: 'https://www.thetimes.co.uk/rss/', country: ['UK'], tier: 'mainstream', language: 'English', region: 'europe' },
    { name: 'The Independent', rssUrl: 'https://www.independent.co.uk/rss', country: ['UK'], tier: 'mainstream', language: 'English', region: 'europe' },

    // ── UK — Independent Left ──
    { name: 'openDemocracy', rssUrl: 'https://www.opendemocracy.net/en/rss.xml', country: ['UK'], tier: 'independent-left', language: 'English', region: 'europe' },

    // ── UK — Independent Right ──
    { name: 'The Spectator', rssUrl: 'https://www.spectator.co.uk/feed/', country: ['UK'], tier: 'independent-right', language: 'English', region: 'europe' },

    // ── GERMANY — Mainstream ──
    { name: 'Der Spiegel International', rssUrl: 'https://www.spiegel.de/international/index.rss', country: ['Germany'], tier: 'mainstream', language: 'English', region: 'europe' },
    { name: 'Handelsblatt Global', rssUrl: 'https://www.handelsblatt.com/rss', country: ['Germany'], tier: 'mainstream', language: 'English', region: 'europe' },

    // ── FRANCE — Independent Left ──
    { name: 'Le Monde Diplomatique English', rssUrl: 'https://mondediplo.com/spip.php?page=backend', country: ['France'], tier: 'independent-left', language: 'English', region: 'europe' },

    // ── ITALY — Mainstream ──
    { name: 'ANSA English', rssUrl: 'https://www.ansa.it/english/news/rss.xml', country: ['Italy'], tier: 'mainstream', language: 'English', region: 'europe' },

    // ── SPAIN — Mainstream ──
    { name: 'El País English', rssUrl: 'https://feeds.elpais.com/mrss-s/list/feed/section/inenglish', country: ['Spain'], tier: 'mainstream', language: 'English', region: 'europe' },

    // ── NORDICS — Mainstream ──
    { name: 'Yle Finland English', rssUrl: 'https://feeds.yle.fi/uutiset/5/8/uutiset-5-8.rss', country: ['Finland'], tier: 'mainstream', language: 'English', region: 'europe' },
    { name: 'The Local Europe', rssUrl: 'https://www.thelocal.com/feed/', country: ['Sweden', 'Norway', 'Denmark', 'Germany', 'France', 'Italy', 'Spain', 'Austria', 'Switzerland'], tier: 'mainstream', language: 'English', region: 'europe' },

    // ── EASTERN EUROPE / UKRAINE / RUSSIA — Mainstream ──
    { name: 'Kyiv Independent', rssUrl: 'https://kyivindependent.com/feed/', country: ['Ukraine'], tier: 'mainstream', language: 'English', region: 'europe' },
    { name: 'Moscow Times', rssUrl: 'https://www.themoscowtimes.com/rss/news', country: ['Russia'], tier: 'mainstream', language: 'English', region: 'europe' },
    { name: 'RFE/RL', rssUrl: 'https://www.rferl.org/api/zqcjqmveiy', country: ['Ukraine', 'Russia', 'Poland', 'Hungary', 'Romania', 'Czech Republic'], tier: 'mainstream', language: 'English', region: 'europe' },
    { name: 'Balkan Insight', rssUrl: 'https://balkaninsight.com/feed/', country: ['Romania', 'Hungary', 'Greece', 'Czech Republic'], tier: 'mainstream', language: 'English', region: 'europe' },
    { name: 'Notes From Poland', rssUrl: 'https://notesfrompoland.com/feed/', country: ['Poland'], tier: 'mainstream', language: 'English', region: 'europe' },

    // ── RUSSIA — Independent Critical ──
    { name: 'Meduza', rssUrl: 'https://meduza.io/rss/en/all', country: ['Russia'], tier: 'independent-critical', language: 'English', region: 'europe' },

    // ── Europe — Business ──
    { name: 'Financial Times', rssUrl: 'https://www.ft.com/rss/home', country: ['UK', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands'], tier: 'business', language: 'English', region: 'europe' },
    { name: 'Bloomberg Europe', rssUrl: 'https://feeds.bloomberg.com/europe/news.rss', country: ['UK', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands'], tier: 'business', language: 'English', region: 'europe' },
    { name: 'Euractiv', rssUrl: 'https://www.euractiv.com/feed/', country: ['Belgium', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Poland'], tier: 'business', language: 'English', region: 'europe' },

    // ── Europe — Government Official ──
    { name: 'European Commission Press Releases', rssUrl: 'https://ec.europa.eu/commission/presscorner/rss/en', country: ['Belgium', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Poland'], tier: 'government-official', language: 'English', region: 'europe' },
    { name: 'European Council', rssUrl: 'https://www.consilium.europa.eu/en/press/press-releases/rss', country: ['Belgium', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Poland'], tier: 'government-official', language: 'English', region: 'europe' },
    { name: 'European Parliament', rssUrl: 'https://www.europarl.europa.eu/rss/doc/press-releases-full.xml', country: ['Belgium', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Poland'], tier: 'government-official', language: 'English', region: 'europe' },
    { name: 'UK Government Press Releases', rssUrl: 'https://www.gov.uk/search/news-and-communications.atom', country: ['UK'], tier: 'government-official', language: 'English', region: 'europe' },
    { name: 'UK Foreign Office', rssUrl: 'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=foreign-commonwealth-development-office', country: ['UK'], tier: 'government-official', language: 'English', region: 'europe' },
    { name: 'German Federal Government', rssUrl: 'https://www.bundesregierung.de/breg-en/feed', country: ['Germany'], tier: 'government-official', language: 'English', region: 'europe' },
    { name: 'NATO', rssUrl: 'https://www.nato.int/cps/en/natolive/rss.htm', country: ['Belgium', 'UK', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Poland', 'Norway', 'Denmark'], tier: 'government-official', language: 'English', region: 'europe' },

    // ── Europe — Think Tank / Academic ──
    { name: 'European Council on Foreign Relations', rssUrl: 'https://ecfr.eu/feed/', country: ['UK', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Poland'], tier: 'think-tank-academic', language: 'English', region: 'europe' },
    { name: 'Chatham House', rssUrl: 'https://www.chathamhouse.org/rss', country: ['UK', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Poland', 'Ukraine', 'Russia'], tier: 'think-tank-academic', language: 'English', region: 'europe' },
    { name: 'IISS', rssUrl: 'https://www.iiss.org/rss', country: ['UK', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Poland', 'Ukraine', 'Russia'], tier: 'think-tank-academic', language: 'English', region: 'europe' },
    { name: 'Carnegie Europe', rssUrl: 'https://carnegieeurope.eu/feed/', country: ['UK', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Poland', 'Ukraine', 'Russia'], tier: 'think-tank-academic', language: 'English', region: 'europe' },
    { name: 'German Marshall Fund', rssUrl: 'https://www.gmfus.org/feed', country: ['Germany', 'UK', 'France', 'Italy', 'Poland'], tier: 'think-tank-academic', language: 'English', region: 'europe' },
    { name: 'Bruegel', rssUrl: 'https://www.bruegel.org/feed/', country: ['Belgium', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands'], tier: 'think-tank-academic', language: 'English', region: 'europe' },
    { name: 'SWP Berlin', rssUrl: 'https://www.swp-berlin.org/en/feed', country: ['Germany', 'UK', 'France', 'Italy', 'Poland', 'Ukraine', 'Russia'], tier: 'think-tank-academic', language: 'English', region: 'europe' },
    { name: 'War on the Rocks', rssUrl: 'https://warontherocks.com/feed/', country: ['UK', 'Germany', 'France', 'Ukraine', 'Russia', 'Poland'], tier: 'think-tank-academic', language: 'English', region: 'europe' },
    { name: 'Visegrad Insight', rssUrl: 'https://visegradinsight.eu/feed/', country: ['Poland', 'Hungary', 'Czech Republic', 'Romania'], tier: 'think-tank-academic', language: 'English', region: 'europe' },
    { name: 'European Policy Centre', rssUrl: 'https://www.epc.eu/rss', country: ['Belgium', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Poland'], tier: 'think-tank-academic', language: 'English', region: 'europe' },
  ],
  'africa': [
    // ── Pan-African — Mainstream ──
    { name: 'AllAfrica', rssUrl: 'https://allafrica.com/tools/headlines/rdf.html', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania', 'Uganda', 'Rwanda', 'Egypt', 'Morocco'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'The Africa Report', rssUrl: 'https://www.theafricareport.com/feed/', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania', 'Uganda', 'Rwanda', 'Egypt', 'Morocco'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'Africanews', rssUrl: 'https://www.africanews.com/feed/', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania', 'Uganda', 'Rwanda', 'Egypt', 'Morocco'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'BBC Africa', rssUrl: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania', 'Uganda', 'Rwanda', 'Egypt', 'Morocco'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'Reuters Africa', rssUrl: 'https://feeds.reuters.com/reuters/AfricaNews', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania', 'Uganda', 'Rwanda', 'Egypt', 'Morocco'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'Al Jazeera Africa', rssUrl: 'https://www.aljazeera.com/xml/rss/africa.xml', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania', 'Uganda', 'Rwanda', 'Egypt', 'Morocco'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'RFI Africa', rssUrl: 'https://www.rfi.fr/en/rss/africa-rss', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania', 'Uganda', 'Rwanda', 'Senegal', 'DRC'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'VOA Africa', rssUrl: 'https://www.voanews.com/api/zmkqmveiy', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania', 'Uganda', 'Rwanda', 'Somalia', 'Sudan'], tier: 'mainstream', language: 'English', region: 'africa' },

    // ── Pan-African — Independent Critical ──
    { name: 'African Arguments', rssUrl: 'https://africanarguments.org/feed/', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania', 'Uganda', 'Rwanda', 'DRC', 'Sudan'], tier: 'independent-critical', language: 'English', region: 'africa' },
    { name: 'Africa Is A Country', rssUrl: 'https://africasacountry.com/feed/', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania', 'Uganda'], tier: 'independent-critical', language: 'English', region: 'africa' },
    { name: 'The Conversation Africa', rssUrl: 'https://theconversation.com/africa/articles.atom', country: ['South Africa', 'Nigeria', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania'], tier: 'independent-critical', language: 'English', region: 'africa' },
    { name: 'Quartz Africa', rssUrl: 'https://qz.com/africa/feed/', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania', 'Uganda', 'Rwanda'], tier: 'independent-critical', language: 'English', region: 'africa' },
    { name: 'Africa Confidential', rssUrl: 'https://www.africa-confidential.com/rss', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania', 'Uganda', 'Rwanda', 'DRC', 'Sudan'], tier: 'independent-critical', language: 'English', region: 'africa' },

    // ── SOUTH AFRICA — Mainstream ──
    { name: 'News24', rssUrl: 'https://feeds.news24.com/articles/news24/TopStories/rss', country: ['South Africa'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'Mail and Guardian', rssUrl: 'https://mg.co.za/feed/', country: ['South Africa'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'Business Day', rssUrl: 'https://businesslive.co.za/bd/rss', country: ['South Africa'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'Sunday Times SA', rssUrl: 'https://www.timeslive.co.za/rss', country: ['South Africa'], tier: 'mainstream', language: 'English', region: 'africa' },

    // ── SOUTH AFRICA — Independent Critical ──
    { name: 'Daily Maverick', rssUrl: 'https://www.dailymaverick.co.za/feed/', country: ['South Africa'], tier: 'independent-critical', language: 'English', region: 'africa' },
    { name: 'amaBhungane', rssUrl: 'https://amabhungane.co.za/feed/', country: ['South Africa'], tier: 'independent-critical', language: 'English', region: 'africa' },

    // ── NIGERIA — Mainstream ──
    { name: 'The Punch Nigeria', rssUrl: 'https://punchng.com/feed/', country: ['Nigeria'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'Vanguard Nigeria', rssUrl: 'https://www.vanguardngr.com/feed/', country: ['Nigeria'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'ThisDay Nigeria', rssUrl: 'https://www.thisdaylive.com/index.php/feed/', country: ['Nigeria'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'The Cable Nigeria', rssUrl: 'https://www.thecable.ng/feed', country: ['Nigeria'], tier: 'mainstream', language: 'English', region: 'africa' },

    // ── NIGERIA — Independent Critical ──
    { name: 'Premium Times Nigeria', rssUrl: 'https://premiumtimesng.com/feed/', country: ['Nigeria'], tier: 'independent-critical', language: 'English', region: 'africa' },
    { name: 'Sahara Reporters', rssUrl: 'https://saharareporters.com/rss.xml', country: ['Nigeria'], tier: 'independent-critical', language: 'English', region: 'africa' },

    // ── KENYA — Mainstream ──
    { name: 'Daily Nation', rssUrl: 'https://nation.africa/rss', country: ['Kenya'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'The Standard Kenya', rssUrl: 'https://www.standardmedia.co.ke/rss', country: ['Kenya'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'The Star Kenya', rssUrl: 'https://www.the-star.co.ke/rss', country: ['Kenya'], tier: 'mainstream', language: 'English', region: 'africa' },

    // ── KENYA — Business ──
    { name: 'Business Daily Africa', rssUrl: 'https://www.businessdailyafrica.com/rss', country: ['Kenya'], tier: 'business', language: 'English', region: 'africa' },

    // ── ETHIOPIA — Mainstream ──
    { name: 'Ethiopian Reporter', rssUrl: 'https://www.ethiopianreporter.com/feed', country: ['Ethiopia'], tier: 'mainstream', language: 'English', region: 'africa' },

    // ── ETHIOPIA — Independent Critical ──
    { name: 'Addis Standard', rssUrl: 'https://addisstandard.com/feed/', country: ['Ethiopia'], tier: 'independent-critical', language: 'English', region: 'africa' },

    // ── GHANA — Mainstream ──
    { name: 'Ghana Web', rssUrl: 'https://www.ghanaweb.com/rss', country: ['Ghana'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'Citifmonline', rssUrl: 'https://citifmonline.com/feed/', country: ['Ghana'], tier: 'mainstream', language: 'English', region: 'africa' },

    // ── EAST AFRICA — Mainstream ──
    { name: 'The East African', rssUrl: 'https://www.theeastafrican.co.ke/rss', country: ['Kenya', 'Tanzania', 'Uganda', 'Rwanda'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'Rwanda New Times', rssUrl: 'https://www.newtimes.co.rw/rss', country: ['Rwanda'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'Uganda Monitor', rssUrl: 'https://www.monitor.co.ug/rss', country: ['Uganda'], tier: 'mainstream', language: 'English', region: 'africa' },

    // ── NORTH AFRICA — Mainstream ──
    { name: 'Egypt Independent', rssUrl: 'https://www.egyptindependent.com/feed/', country: ['Egypt'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'Morocco World News', rssUrl: 'https://www.moroccoworldnews.com/feed/', country: ['Morocco'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'Libya Observer', rssUrl: 'https://libyaobserver.ly/feed', country: ['Libya'], tier: 'mainstream', language: 'English', region: 'africa' },
    { name: 'Algeria Press Service', rssUrl: 'https://www.aps.dz/en/rss', country: ['Algeria'], tier: 'mainstream', language: 'English', region: 'africa' },

    // ── DRC / CENTRAL AFRICA — Mainstream ──
    { name: 'Radio Okapi English', rssUrl: 'https://www.radiookapi.net/en/feed', country: ['DRC'], tier: 'mainstream', language: 'English', region: 'africa' },

    // ── HORN OF AFRICA — Independent Critical ──
    { name: 'Somalia Garowe Online', rssUrl: 'https://www.garoweonline.com/en/rss', country: ['Somalia'], tier: 'independent-critical', language: 'English', region: 'africa' },
    { name: 'Sudan Tribune', rssUrl: 'https://www.sudantribune.com/spip.php?page=backend', country: ['Sudan'], tier: 'independent-critical', language: 'English', region: 'africa' },

    // ── Africa — Business ──
    { name: 'African Business', rssUrl: 'https://african.business/feed/', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania'], tier: 'business', language: 'English', region: 'africa' },
    { name: 'How We Made It In Africa', rssUrl: 'https://www.howwemadeitinafrica.com/feed/', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania'], tier: 'business', language: 'English', region: 'africa' },

    // ── Africa — Government Official ──
    { name: 'African Union Press Releases', rssUrl: 'https://www.au.int/en/rss', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania', 'Uganda', 'Rwanda', 'Egypt', 'Morocco'], tier: 'government-official', language: 'English', region: 'africa' },
    { name: 'South Africa Presidency', rssUrl: 'https://www.thepresidency.gov.za/rss', country: ['South Africa'], tier: 'government-official', language: 'English', region: 'africa' },
    { name: 'Nigerian Presidency', rssUrl: 'https://statehouse.gov.ng/feed/', country: ['Nigeria'], tier: 'government-official', language: 'English', region: 'africa' },
    { name: 'Kenyan Government', rssUrl: 'https://www.president.go.ke/rss', country: ['Kenya'], tier: 'government-official', language: 'English', region: 'africa' },

    // ── Africa — Think Tank / Academic ──
    { name: 'Institute for Security Studies Africa', rssUrl: 'https://issafrica.org/feed', country: ['South Africa', 'Nigeria', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania', 'Uganda', 'Rwanda', 'DRC', 'Sudan'], tier: 'think-tank-academic', language: 'English', region: 'africa' },
    { name: 'South African Institute of International Affairs', rssUrl: 'https://saiia.org.za/feed/', country: ['South Africa'], tier: 'think-tank-academic', language: 'English', region: 'africa' },
    { name: 'African Development Bank', rssUrl: 'https://www.afdb.org/en/rss', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania', 'Uganda', 'Rwanda', 'Egypt', 'Morocco'], tier: 'think-tank-academic', language: 'English', region: 'africa' },
    { name: 'Brookings Africa', rssUrl: 'https://www.brookings.edu/feed/?region=africa', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania'], tier: 'think-tank-academic', language: 'English', region: 'africa' },
    { name: 'International Crisis Group Africa', rssUrl: 'https://www.crisisgroup.org/rss/africa', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania', 'Uganda', 'Rwanda', 'DRC', 'Sudan', 'Somalia'], tier: 'think-tank-academic', language: 'English', region: 'africa' },
    { name: 'Chatham House Africa', rssUrl: 'https://www.chathamhouse.org/rss/regions/africa', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania', 'Uganda', 'Rwanda', 'DRC', 'Sudan'], tier: 'think-tank-academic', language: 'English', region: 'africa' },
    { name: 'Africa Policy Research Institute', rssUrl: 'https://afripoli.org/feed', country: ['Nigeria', 'South Africa', 'Kenya', 'Ethiopia', 'Ghana', 'Tanzania'], tier: 'think-tank-academic', language: 'English', region: 'africa' },
  ],
  'southeast-asia': [
    // ── Regional — Mainstream ──
    { name: 'Nikkei Asia', rssUrl: 'https://asia.nikkei.com/rss/feed/nar', country: ['Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore', 'Cambodia', 'Laos'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'Channel News Asia', rssUrl: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml', country: ['Singapore', 'Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Cambodia'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'South China Morning Post Asia', rssUrl: 'https://www.scmp.com/rss/91/feed', country: ['Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore', 'Cambodia'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'The Diplomat Southeast Asia', rssUrl: 'https://thediplomat.com/regions/southeast-asia/feed', country: ['Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore', 'Cambodia', 'Laos'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'Southeast Asia Globe', rssUrl: 'https://southeastasiaglobe.com/feed', country: ['Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore', 'Cambodia', 'Laos'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'Asia Sentinel', rssUrl: 'https://asiasentinel.com/feed', country: ['Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore', 'Cambodia'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'Benar News', rssUrl: 'https://www.benarnews.org/rss/english', country: ['Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Cambodia'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },

    // ── Regional — Independent Left ──
    { name: 'New Mandala', rssUrl: 'https://www.newmandala.org/feed/', country: ['Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore', 'Cambodia', 'Laos'], tier: 'independent-left', language: 'English', region: 'southeast-asia' },
    { name: 'East Asia Forum', rssUrl: 'https://www.eastasiaforum.org/feed/', country: ['Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore', 'Cambodia'], tier: 'independent-left', language: 'English', region: 'southeast-asia' },
    { name: 'The Interpreter Lowy', rssUrl: 'https://www.lowyinstitute.org/the-interpreter/rss', country: ['Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore', 'Cambodia'], tier: 'independent-left', language: 'English', region: 'southeast-asia' },

    // ── SINGAPORE — Mainstream ──
    { name: 'Straits Times', rssUrl: 'https://www.straitstimes.com/RSS/STITopStories.xml', country: ['Singapore'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'Today Singapore', rssUrl: 'https://www.todayonline.com/feed', country: ['Singapore'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'Business Times Singapore', rssUrl: 'https://www.businesstimes.com.sg/rss/top-stories', country: ['Singapore'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },

    // ── THAILAND — Mainstream ──
    { name: 'Bangkok Post', rssUrl: 'https://www.bangkokpost.com/rss/data/topstories.xml', country: ['Thailand'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'The Nation Thailand', rssUrl: 'https://www.nationthailand.com/rss', country: ['Thailand'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },

    // ── THAILAND — Independent Critical ──
    { name: 'Prachatai English', rssUrl: 'https://prachatai.com/english/feed', country: ['Thailand'], tier: 'independent-critical', language: 'English', region: 'southeast-asia' },

    // ── INDONESIA — Mainstream ──
    { name: 'Jakarta Post', rssUrl: 'https://www.thejakartapost.com/rss/id/all', country: ['Indonesia'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'Jakarta Globe', rssUrl: 'https://jakartaglobe.id/feed', country: ['Indonesia'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'Tempo English', rssUrl: 'https://en.tempo.co/rss/20', country: ['Indonesia'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },

    // ── PHILIPPINES — Mainstream ──
    { name: 'Philippine Daily Inquirer', rssUrl: 'https://newsinfo.inquirer.net/feed', country: ['Philippines'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'ABS-CBN News', rssUrl: 'https://news.abs-cbn.com/rss/headlines', country: ['Philippines'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'Philstar Global', rssUrl: 'https://www.philstar.com/rss/headlines', country: ['Philippines'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'Manila Times', rssUrl: 'https://www.manilatimes.net/feed', country: ['Philippines'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },

    // ── PHILIPPINES — Independent Critical ──
    { name: 'Rappler', rssUrl: 'https://www.rappler.com/rss', country: ['Philippines'], tier: 'independent-critical', language: 'English', region: 'southeast-asia' },

    // ── MALAYSIA — Mainstream ──
    { name: 'Malay Mail', rssUrl: 'https://www.malaymail.com/feed/', country: ['Malaysia'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'Free Malaysia Today', rssUrl: 'https://www.freemalaysiatoday.com/feed/', country: ['Malaysia'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'New Straits Times', rssUrl: 'https://www.nst.com.my/rss', country: ['Malaysia'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },

    // ── MALAYSIA — Independent Critical ──
    { name: 'Malaysiakini', rssUrl: 'https://www.malaysiakini.com/rss', country: ['Malaysia'], tier: 'independent-critical', language: 'English', region: 'southeast-asia' },

    // ── VIETNAM — Mainstream ──
    { name: 'VnExpress International', rssUrl: 'https://e.vnexpress.net/rss/news.rss', country: ['Vietnam'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'Vietnam News', rssUrl: 'https://vietnamnews.vn/rss', country: ['Vietnam'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'Tuoi Tre News', rssUrl: 'https://tuoitrenews.vn/rss', country: ['Vietnam'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },

    // ── CAMBODIA — Mainstream ──
    { name: 'Phnom Penh Post', rssUrl: 'https://www.phnompenhpost.com/rss', country: ['Cambodia'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'Khmer Times', rssUrl: 'https://www.khmertimeskh.com/feed', country: ['Cambodia'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },

    // ── CAMBODIA — Independent Critical ──
    { name: 'VOD English', rssUrl: 'https://vodenglish.news/feed', country: ['Cambodia'], tier: 'independent-critical', language: 'English', region: 'southeast-asia' },

    // ── LAOS — Mainstream ──
    { name: 'Vientiane Times', rssUrl: 'https://www.vientianetimes.org.la/feed', country: ['Laos'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },
    { name: 'Laotian Times', rssUrl: 'https://laotiantimes.com/feed', country: ['Laos'], tier: 'mainstream', language: 'English', region: 'southeast-asia' },

    // ── Southeast Asia — Business ──
    { name: 'Deal Street Asia', rssUrl: 'https://www.dealstreetasia.com/feed', country: ['Singapore', 'Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia'], tier: 'business', language: 'English', region: 'southeast-asia' },
    { name: 'ASEAN Briefing', rssUrl: 'https://www.aseanbriefing.com/news/feed/', country: ['Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore', 'Cambodia'], tier: 'business', language: 'English', region: 'southeast-asia' },
    { name: 'Eco-Business', rssUrl: 'https://www.eco-business.com/feed/', country: ['Singapore', 'Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia'], tier: 'business', language: 'English', region: 'southeast-asia' },

    // ── Southeast Asia — Government Official ──
    { name: 'ASEAN Official Statements', rssUrl: 'https://asean.org/news/rss', country: ['Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore', 'Cambodia', 'Laos', 'Brunei'], tier: 'government-official', language: 'English', region: 'southeast-asia' },
    { name: 'Singapore MFA', rssUrl: 'https://www.mfa.gov.sg/Newsroom/Press-Statements-Transcripts-and-Photos/rss', country: ['Singapore'], tier: 'government-official', language: 'English', region: 'southeast-asia' },
    { name: 'Philippines DFA', rssUrl: 'https://dfa.gov.ph/feed/', country: ['Philippines'], tier: 'government-official', language: 'English', region: 'southeast-asia' },
    { name: 'Indonesian MFA', rssUrl: 'https://kemlu.go.id/en/berita/siaran-pers/rss', country: ['Indonesia'], tier: 'government-official', language: 'English', region: 'southeast-asia' },
    { name: 'Malaysian MFA', rssUrl: 'https://kln.gov.my/rss', country: ['Malaysia'], tier: 'government-official', language: 'English', region: 'southeast-asia' },
    { name: 'Thai MFA', rssUrl: 'https://www.mfa.go.th/en/rss', country: ['Thailand'], tier: 'government-official', language: 'English', region: 'southeast-asia' },

    // ── Southeast Asia — Think Tank / Academic ──
    { name: 'ISEAS-Yusof Ishak Institute', rssUrl: 'https://www.iseas.edu.sg/feed/', country: ['Singapore', 'Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Cambodia', 'Laos'], tier: 'think-tank-academic', language: 'English', region: 'southeast-asia' },
    { name: 'Lowy Institute', rssUrl: 'https://www.lowyinstitute.org/feed', country: ['Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore', 'Cambodia'], tier: 'think-tank-academic', language: 'English', region: 'southeast-asia' },
    { name: 'Australian Strategic Policy Institute', rssUrl: 'https://www.aspi.org.au/rss', country: ['Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore', 'Cambodia'], tier: 'think-tank-academic', language: 'English', region: 'southeast-asia' },
    { name: 'Pacific Forum CSIS', rssUrl: 'https://pacforum.org/feed', country: ['Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore'], tier: 'think-tank-academic', language: 'English', region: 'southeast-asia' },
    { name: 'CSIS Southeast Asia', rssUrl: 'https://www.csis.org/programs/southeast-asia-program/feed', country: ['Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore', 'Cambodia'], tier: 'think-tank-academic', language: 'English', region: 'southeast-asia' },
    { name: 'Stimson Southeast Asia', rssUrl: 'https://www.stimson.org/feed', country: ['Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore', 'Cambodia'], tier: 'think-tank-academic', language: 'English', region: 'southeast-asia' },
  ],
  'east-asia': [],
  'oceania': [],
  'global': []
};

module.exports = SOURCES;
