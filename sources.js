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
  'north-america': [],
  'latin-america': [],
  'central-asia-caucasus': [],
  'middle-east': [],
  'europe': [],
  'africa': [],
  'southeast-asia': [],
  'east-asia': [],
  'oceania': [],
  'global': []
};

module.exports = SOURCES;
