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
  'europe': [],
  'africa': [],
  'southeast-asia': [],
  'east-asia': [],
  'oceania': [],
  'global': []
};

module.exports = SOURCES;
