/**
 * Sadržaj stranice About. Oba jezika su u istom HTML-u (`.l-hr` / `.l-en`),
 * a prikaz bira atribut `lang` na `.about-story` (spec §2b.9).
 * Lokalni statični sadržaj, nije korisnički unos.
 */
export const ABOUT_STORY_HTML = String.raw`<nav class="chapters" aria-label="Poglavlja">
  <div class="nav-in">
  <ol>
    <li><a href="#vodic"><span>▶</span><b class="l-hr">Vodič</b><b class="l-en">Guide</b></a></li>
    <li><a href="#avion"><span>01</span><b class="l-hr">Avion</b><b class="l-en">Aircraft</b></a></li>
    <li><a href="#poruka"><span>02</span><b class="l-hr">Poruka</b><b class="l-en">Message</b></a></li>
    <li><a href="#antena"><span>03</span><b class="l-hr">Antena</b><b class="l-en">Antenna</b></a></li>
    <li><a href="#izvori"><span>04</span><b class="l-hr">Izvori</b><b class="l-en">Sources</b></a></li>
    <li><a href="#server"><span>05</span>Server</a></li>
    <li><a href="#obrada"><span>06</span><b class="l-hr">Obrada</b><b class="l-en">Processing</b></a></li>
    <li><a href="#rute"><span>07</span><b class="l-hr">Rute</b><b class="l-en">Routes</b></a></li>
    <li><a href="#kasnjenje"><span>08</span><b class="l-hr">Kašnjenje</b><b class="l-en">Delay</b></a></li>
    <li><a href="#karta"><span>09</span><b class="l-hr">Karta</b><b class="l-en">Map</b></a></li>
    <li><a href="#pitanja"><span>?</span><b class="l-hr">Pitanja</b><b class="l-en">Questions</b></a></li>
  </ol>
  <div class="lang" role="group" aria-label="Jezik / Language">
    <button type="button" data-lang="hr" aria-pressed="true">HR</button>
    <button type="button" data-lang="en" aria-pressed="false">EN</button>
  </div>
  </div>
</nav>
<div class="wrap">
  <header class="hero">
    <div class="tag" style="--c: var(--data)"><span class="l-hr l-w">LunaPic · put jednog podatka</span><span class="l-en l-w">LunaPic · the journey of one data point</span></div>
    <h1><span class="l-hr l-w">Kako avion <em>sam javlja</em> gdje je, i kako to stigne na vašu kartu</span><span class="l-en l-w">How an aircraft <em>reports</em> its own position, and how that reaches your map</span></h1>
    <p class="lede"><span class="l-hr l-w">Iznad Zagreba u svakom trenutku leti desetak do pedeset aviona. Svaki od njih nekoliko puta u sekundi radiom javlja svoj položaj. LunaPic te poruke hvata vlastitim prijamnikom, sprema ih u svoju bazu i iz njih računa koji bi avion mogao proletjeti ispred Mjeseca, do 5 minuta unaprijed. Ova stranica prvo pokazuje kako se aplikacija koristi, a zatim bez tehničkog predznanja prati put jedne takve poruke od aviona do karte.</span><span class="l-en l-w">At any moment, somewhere between ten and fifty aircraft are flying over Zagreb. Each of them reports its position by radio several times a second. LunaPic picks up those messages with its own receiver, stores them in its database and works out which aircraft might fly in front of the Moon, up to 5 minutes ahead. This page first shows how to use the app, then follows one such message from the aircraft to the map, no technical background needed.</span></p>
    <div class="stage">
      <div class="stage3d hero3d" id="hero3d" role="img" aria-label="3D prikaz: avion šalje radio valove, vlastita stanica ih hvata, podaci putuju na LunaPic server i dalje na mobitel"><div class="labels"></div><div class="hint"><span class="l-hr l-w">Povucite za okretanje pogleda</span><span class="l-en l-w">Drag to rotate the view</span></div><p class="nogl-msg"><span class="l-hr l-w">Ovaj preglednik ne podržava 3D prikaz.</span><span class="l-en l-w">This browser does not support 3D graphics.</span></p></div>
      <div class="stage-legend"><span class="l-hr l-w">
        <span><i class="sw sw-wave"></i>Narančasti valovi: avion odašilje radio signal na 1090 MHz</span>
        <span><i class="sw sw-data"></i>Plave linije i točkice: podaci putuju internetom do servera i mobitela</span>
        <span><i class="sw sw-ok"></i>Zeleni bljesak: podatak je stigao u aplikaciju</span>
      </span><span class="l-en l-w"> <span><i class="sw sw-wave"></i>Orange waves: the aircraft broadcasts a radio signal on 1090 MHz</span> <span><i class="sw sw-data"></i>Blue lines and dots: data travels over the internet to the server and the phone</span> <span><i class="sw sw-ok"></i>Green flash: the data has reached the app</span> </span></div>
    </div>
    <div class="kpis">
      <div class="kpi" style="--c: var(--radio)"><b>1090 MHz</b><small><span class="l-hr l-w">frekvencija na kojoj svi avioni javljaju položaj</span><span class="l-en l-w">the frequency every aircraft uses to report its position</span></small></div>
      <div class="kpi" style="--c: var(--radio)"><b>~2 × /s</b><small><span class="l-hr l-w">koliko često avion šalje svoju poziciju</span><span class="l-en l-w">how often an aircraft sends its position</span></small></div>
      <div class="kpi" style="--c: var(--data)"><b>~350 km</b><small><span class="l-hr l-w">domet vlastitog prijamnika za avione na velikoj visini</span><span class="l-en l-w">range of the own receiver for high-flying aircraft</span></small></div>
      <div class="kpi" style="--c: var(--ok)"><b>5 min</b><small><span class="l-hr l-w">koliko unaprijed LunaPic najavljuje tranzit</span><span class="l-en l-w">how far ahead LunaPic announces a transit</span></small></div>
    </div>
  </header>
  <section class="ch guide" id="vodic" style="--c: var(--ok)">
    <div class="ch-head">
      <div class="ch-num">▶</div>
      <div class="tag"><span class="l-hr">Vodič za fotografe</span><span class="l-en">Photographer's guide</span></div>
      <h2><span class="l-hr">Od prvog koraka do okidanja</span><span class="l-en">From the first step to the shutter</span></h2>
    </div>
    <div class="prose">
      <p class="l-hr">Tranzit aviona preko Mjeseca traje djelić sekunde, a Mjesec je na nebu širok samo pola stupnja. Zato se sve odlučuje unaprijed: gdje stojite, koji avion, u kojem trenutku. Ovo je redoslijed kojim se LunaPic koristi na terenu. Nazivi panela i gumba navedeni su onako kako piše u aplikaciji.</p>
      <p class="l-en">An aircraft crosses the Moon in a fraction of a second, and the Moon is only half a degree wide in the sky. So everything is decided in advance: where you stand, which aircraft, at what moment. This is the order in which LunaPic is used in the field. Panel and button names match the app.</p>
    </div>
    <div class="card nav-help">
      <div class="tag" style="--c: var(--data)"><span class="l-hr">Gdje je što</span><span class="l-en">Where things are</span></div>
      <p class="muted l-hr">Ploča <b>Next transit</b> uvijek pokazuje sljedeći tranzit. <b>Na računalu</b> izbornik lijevo drži sve panele u pet grupa: Now, Shoot, Sky and place, Feeds i Plan. <b>Na mobitelu</b> donja traka otvara Active, Candidates, Photo i Moon jednim dodirom, a More sve ostalo. GPS, Set my location here i Focus on me su gumbi gore desno, a vremenska crta je stalno vidljiva.</p>
      <p class="muted l-en">The <b>Next transit</b> board always shows the next transit. <b>On a computer</b>, the left menu holds all panels in five groups: Now, Shoot, Sky and place, Feeds and Plan. <b>On a phone</b>, the bottom bar opens Active, Candidates, Photo and Moon with one tap, and More holds the rest. GPS, Set my location here and Focus on me are buttons at the top right, and the time line is always visible.</p>
    </div>
    <div class="phase">
      <div class="phase-head"><span class="phase-tag">A</span><h3><span class="l-hr">Prije izlaska</span><span class="l-en">Before you go</span></h3></div>
      <ol class="gsteps">
        <li class="gstep">
          <div class="gnum">1</div>
          <div class="gbody">
            <h3><span class="l-hr">Provjerite Mjesec</span><span class="l-en">Check the Moon</span></h3>
            <div class="chips"><span class="chip-ui">Moon (nowcast)</span><span class="chip-ui">Sync</span></div>
            <p class="l-hr">Mjesec mora biti iznad horizonta i dovoljno visoko. Panel pokazuje njegovu visinu, smjer, osvijetljenost te vrijeme izlaska i zalaska, uz ocjenu vidljivosti. Vremenskom crtom možete gledati do 24 sata unaprijed, a <b>Sync</b> vraća na sadašnji trenutak. Crta pomiče samo Mjesec na karti, a kandidati i upozorenja uvijek rade za stvarno vrijeme.</p>
            <p class="l-en">The Moon has to be above the horizon and high enough. The panel shows its altitude, direction, illumination, moonrise and moonset, plus a visibility rating. The time line lets you look up to 24 hours ahead, and <b>Sync</b> brings you back to now. It only moves the Moon on the map; candidates and alerts always work in real time.</p>
            <div class="vis-tiers">
              <span class="tier t-ok"><b>Optimal</b><span class="l-hr">dobra visina</span><span class="l-en">good altitude</span></span>
              <span class="tier t-warn"><b>Caution</b><span class="l-hr">granično</span><span class="l-en">borderline</span></span>
              <span class="tier t-bad"><b>Critical</b><span class="l-hr">prenisko</span><span class="l-en">too low</span></span>
            </div>
            <p class="tip l-hr">Oblake i maglicu aplikacija ne vidi. To provjerite pogledom kroz prozor.</p>
            <p class="tip l-en">The app cannot see clouds or haze. Check that by looking out of the window.</p>
          </div>
        </li>
        <li class="gstep">
          <div class="gnum">2</div>
          <div class="gbody">
            <h3><span class="l-hr">Postavite sebe na kartu</span><span class="l-en">Put yourself on the map</span></h3>
            <div class="chips"><span class="chip-ui">Observer</span><span class="chip-ui">Set my location here</span><span class="chip-ui">Field overlays → Lock location</span></div>
            <p class="l-hr">Svi izračuni rade se za točku na kojoj stojite, a ne za sredinu karte. Dopustite GPS, upišite koordinate ili odvucite ikonu fotića točno na svoje mjesto. Visinu tla aplikacija uzima iz GPS-a, a ako je on ne javi, iz modela terena. Kad ste na mjestu, uključite <b>Lock location</b>, da slučajno ne pomaknete točku.</p>
            <p class="l-en">All calculations are made for the spot where you stand, not for the centre of the map. Allow GPS, type coordinates or drag the camera icon exactly to your position. Ground height comes from GPS or, if GPS does not report it, from the terrain model. Once you are in place, turn on <b>Lock location</b> so you do not move the point by accident.</p>
          </div>
        </li>
        <li class="gstep">
          <div class="gnum">3</div>
          <div class="gbody">
            <h3><span class="l-hr">Namjestite aparat i objektiv</span><span class="l-en">Set your camera and lens</span></h3>
            <div class="chips"><span class="chip-ui">Photographer</span><span class="chip-ui">Camera settings</span></div>
            <p class="l-hr">Odaberite svoje tijelo aparata. Ako ga nema na popisu, odaberite <b>Other</b> pa upišite senzor i rezoluciju. Zatim upišite žarišnu duljinu. O tome ovisi do koje udaljenosti avion još ima smisla (na 600 mm s full frame senzorom oko 80 km), koji će avioni pozeleniti na karti i koliki će avion biti u kadru.</p>
            <p class="l-en">Pick your camera body. If it is not in the list, choose <b>Other</b> and enter the sensor and resolution. Then enter the focal length. This decides how far away an aircraft is still worth it (about 80 km at 600 mm on full frame), which aircraft turn green on the map and how big the aircraft will be in the frame.</p>
          </div>
        </li>
      </ol>
    </div>
    <div class="phase">
      <div class="phase-head"><span class="phase-tag">B</span><h3><span class="l-hr">Lov na karti</span><span class="l-en">Hunting on the map</span></h3></div>
      <ol class="gsteps" start="4">
        <li class="gstep">
          <div class="gnum">4</div>
          <div class="gbody">
            <h3><span class="l-hr">Provjerite izvor podataka</span><span class="l-en">Check the data source</span></h3>
            <div class="chips"><span class="chip-ui">Flight source</span><span class="chip-ui">LunaPic ADS-B</span></div>
            <p class="l-hr">Zadano radi samo <b>LunaPic ADS-B</b>, vlastiti prijamnik, a broj uz njega kaže koliko aviona vidi. Ako piše <b>offline</b> ili snimate daleko od Zagreba, uključite <b>OpenSky</b> ili <b>adsb.lol</b>. Te pozicije kasne do 30 sekundi, pa odbrojavanje uzmite s rezervom. Izbor se ne pamti između posjeta.</p>
            <p class="l-en">By default only <b>LunaPic ADS-B</b>, the own receiver, is on, and the number next to it shows how many aircraft it sees. If it says <b>offline</b> or you are shooting far from Zagreb, turn on <b>OpenSky</b> or <b>adsb.lol</b>. Those positions lag by up to 30 seconds, so take the countdown with a pinch of salt. The choice is not remembered between visits.</p>
          </div>
        </li>
        <li class="gstep">
          <div class="gnum">5</div>
          <div class="gbody">
            <h3><span class="l-hr">Pročitajte kartu</span><span class="l-en">Read the map</span></h3>
            <div class="chips"><span class="chip-ui">Layers</span><span class="chip-ui">Altitude</span></div>
            <p class="l-hr">Linija od fotića pokazuje smjer Mjeseca u odabranom trenutku, a cijan crta <b>NOW</b> smjer u stvarnom vremenu. Isprekidani luk je put Mjeseca po nebu. Kad je ocjena vidljivosti Optimal, pojavi se zeleni koridor, područje u kojem je tranzit najizgledniji. Boja i veličina aviona pokazuju visinu: manji leti više. Na skali visine možete sakriti avione koji vas ne zanimaju.</p>
            <p class="l-en">The line from the camera icon shows the Moon's direction at the chosen moment, and the cyan <b>NOW</b> line shows it in real time. The dashed arc is the Moon's path across the sky. When the visibility rating is Optimal, a green corridor appears: the area where a transit is most likely. Aircraft colour and size show altitude: smaller means higher. Use the altitude scale to hide aircraft you do not care about.</p>
          </div>
        </li>
        <li class="gstep">
          <div class="gnum">6</div>
          <div class="gbody">
            <h3><span class="l-hr">Gledajte kandidate</span><span class="l-en">Watch the candidates</span></h3>
            <div class="chips"><span class="chip-ui">Next transit</span><span class="chip-ui">Transit candidates</span><span class="chip-ui">Δalt</span></div>
            <p class="l-hr">Avion se može pojaviti i do 5 minuta prije tranzita. Ploča <b>Next transit</b> pokazuje najbliži, a panel popis, u dvije skupine. <b>Disk transit</b> su letovi za koje predviđanje kaže da prolaze kroz sam disk. <b>In frame</b> su oni koji će biti u kadru, ali pokraj Mjeseca. Avioni koji se penju ili spuštaju ovdje ostaju do oko 2 minute prije poravnanja. Prikazuju se samo prolazi unutar 100 km. Značka <b>Δalt</b> kaže koliko će avion biti iznad (+) ili ispod (−) Mjeseca u trenutku kad mu se smjer poklopi s Mjesecom. Na karti zeleni prsten oko aviona znači potvrđen prolaz kroz disk.</p>
            <p class="l-en">An aircraft can appear up to 5 minutes before its transit. The <b>Next transit</b> board shows the nearest one, and the panel lists them in two groups. <b>Disk transit</b> flights are predicted to pass through the disc itself. <b>In frame</b> flights will be in the frame, but beside the Moon. Climbing or descending aircraft stay here until about 2 minutes before alignment. Only passes within 100 km are listed. The <b>Δalt</b> badge tells you how far above (+) or below (−) the Moon the aircraft will be when its direction lines up with the Moon. On the map, a green ring around an aircraft means a confirmed pass through the disc.</p>
            <div class="badges">
              <span class="dbadge b-ok">Δalt +0.12°</span><span class="bdesc"><span class="l-hr">unutar diska, to je to</span><span class="l-en">inside the disc, this is it</span></span>
              <span class="dbadge b-warn">Δalt −0.9°</span><span class="bdesc"><span class="l-hr">blizu, ali promašaj</span><span class="l-en">close, but a miss</span></span>
              <span class="dbadge b-grey">Δalt +4.3°</span><span class="bdesc"><span class="l-hr">nema šanse</span><span class="l-en">no chance</span></span>
            </div>
          </div>
        </li>
      </ol>
      <div class="card dalt" id="dalt">
        <div class="tag" style="--c: var(--ok)"><span class="l-hr">Isprobajte · zašto većina aviona promaši</span><span class="l-en">Try it · why most aircraft miss</span></div>
        <p class="muted l-hr" style="font-size:.95rem">Avion na zadanoj visini poklopi se s Mjesecom samo na jednoj udaljenosti od vas. Ako je dalje, vidite ga ispod Mjeseca, a ako je bliže, iznad. Pomičite klizač i gledajte kako se mijenja Δalt.</p>
        <p class="muted l-en" style="font-size:.95rem">An aircraft at a given altitude lines up with the Moon at only one distance from you. Farther away, you see it below the Moon; closer, above it. Move the slider and watch Δalt change.</p>
        <div class="dalt-grid">
          <svg id="dalt-side" viewBox="0 0 640 250" role="img" aria-label=""></svg>
          <div class="dalt-sky-wrap">
            <svg id="dalt-sky" viewBox="0 0 200 200" role="img" aria-label=""></svg>
            <div class="dalt-read" id="dalt-read" aria-live="polite"></div>
          </div>
        </div>
        <div class="slider">
          <label for="dalt-d" class="muted" style="font-size:0.9rem"><span class="l-hr">Udaljenost aviona</span><span class="l-en">Aircraft distance</span></label>
          <input type="range" id="dalt-d" min="6" max="40" step="0.1" value="24">
          <output id="dalt-out" for="dalt-d"></output>
        </div>
        <p class="muted l-hr" style="font-size:.82rem">Pojednostavljeno: avion na 10 km, Mjesec na 30°, bez zakrivljenosti Zemlje. LunaPic računa točno, iz stvarne putanje i položaja Mjeseca u budućem trenutku.</p>
        <p class="muted l-en" style="font-size:.82rem">Simplified: aircraft at 10 km, Moon at 30°, no Earth curvature. LunaPic does the exact maths from the real path and the Moon's position at that future moment.</p>
      </div>
      <ol class="gsteps" start="7">
        <li class="gstep">
          <div class="gnum">7</div>
          <div class="gbody">
            <h3><span class="l-hr">Uključite obavijesti</span><span class="l-en">Turn on alerts</span></h3>
            <div class="chips"><span class="chip-ui">Transit alerts</span></div>
            <p class="l-hr">Zvonce u panelu kandidata uključuje zvuk i obavijesti. Dok gledate aplikaciju, javlja se zvukom i natpisom. Kad je mobitel zaključan ili je aplikacija zatvorena, server pošalje push obavijest, jer on sam pazi na tranzite i kad LunaPic nije otvoren. Na iPhoneu to radi ako je LunaPic dodan na početni zaslon. Ako prijamnik utihne, upozorenja ne stižu, pa nakon 5 minuta dobijete posebnu obavijest o tome.</p>
            <p class="l-en">The bell in the candidates panel turns on sound and notifications. While you are looking at the app, it alerts you with a sound and a banner. When the phone is locked or the app is closed, the server sends a push notification, because it watches for transits on its own even when LunaPic is not open. On iPhone this works once LunaPic is added to the Home Screen. If the receiver goes silent, no alerts arrive, so after 5 minutes you get a separate notification about that.</p>
          </div>
        </li>
        <li class="gstep">
          <div class="gnum">8</div>
          <div class="gbody">
            <h3><span class="l-hr">Odaberite avion</span><span class="l-en">Pick an aircraft</span></h3>
            <div class="chips"><span class="chip-ui">Next transit</span><span class="chip-ui">Layers → Stand-here line</span><span class="chip-ui">Active transits</span></div>
            <p class="l-hr">Dodirnite avion na karti ili u popisu kandidata. Za kandidata ploča <b>Next transit</b> kaže jeste li <b>On the line</b> ili <b>Off the line</b>, koliko ste metara lijevo ili desno gledano prema Mjesecu i u kojem rasponu disk ostaje pokriven.</p>
            <p class="l-hr">Da isto vidite na karti, otvorite <b>Layers</b> i pod Reference uključite <b>Stand-here line</b>, jer je zadano isključena. Zelena crtkana linija pokazuje gdje bi u kojem trenutku trebalo stajati, s oznakama od +1m do +5m za sljedećih pet minuta. Zelena točka je to mjesto sada, a oko nje je zona tolerancije. Točka se kreće brzinom aviona, oko 15 km u minuti, pa to nije mjesto do kojeg se ide. Gledajte prolazi li linija preko vašeg položaja: oznaka uz koju prolazi kaže kada.</p>
            <p class="l-hr">Plava traka s bijelom linijom pojavi se sama pri odabiru i povezuje vas s avionom, a crtkana crta <b>+90s</b> pokazuje kamo avion ide u sljedećih 90 sekundi. Kad tranzit već traje, u panelu <b>Active transits</b> odaberite avion: strelica pokazuje koliko metara i u kojem smjeru treba hodati, a unutar 5 m pojavi se Centered uz dvostruki zvuk.</p>
            <p class="l-en">Tap an aircraft on the map or in the candidates list. For a candidate, the <b>Next transit</b> board tells you whether you are <b>On the line</b> or <b>Off the line</b>, how many metres left or right you are when facing the Moon, and the range within which the disc stays covered.</p>
            <p class="l-en">To see the same thing on the map, open <b>Layers</b> and turn on <b>Stand-here line</b> under Reference, because it is off by default. The green dashed line shows where you would need to stand at each moment, with ticks from +1m to +5m for the next five minutes. The green dot is that spot right now, with the tolerance zone around it. The dot moves at the aircraft's speed, about 15 km a minute, so it is not a place to go to. Watch whether the line crosses your position: the tick it passes tells you when.</p>
            <p class="l-en">The blue strip with a white line appears on its own when you select an aircraft and connects you to it, and the dashed <b>+90s</b> line shows where the aircraft is heading in the next 90 seconds. Once a transit is under way, select the aircraft in the <b>Active transits</b> panel: an arrow shows how many metres to walk and in which direction, and within 5 m it turns into Centered with a double chime.</p>
          </div>
        </li>
      </ol>
    </div>
    <div class="phase">
      <div class="phase-head"><span class="phase-tag">C</span><h3><span class="l-hr">Na terenu</span><span class="l-en">In the field</span></h3></div>
      <ol class="gsteps" start="9">
        <li class="gstep">
          <div class="gnum">9</div>
          <div class="gbody">
            <h3><span class="l-hr">Pratite približavanje</span><span class="l-en">Follow the approach</span></h3>
            <div class="chips"><span class="chip-ui">Photographer</span><span class="chip-ui">Shot feasibility</span><span class="chip-ui">Elevation gap at alignment</span></div>
            <p class="l-hr">Za odabrani avion panel pokazuje odbrojavanje do poravnanja, udaljenost, ocjenu <b>Shot feasibility</b> (EXCELLENT, FAIR ili POOR) i <b>Elevation gap at alignment</b>. Minus znači da avion prolazi ispod Mjeseca, a plus iznad. Pregled tražila crta Mjesec u fazi za taj trenutak i avion u stvarnoj veličini za vaš objektiv. Dok je avion izvan kadra, strelica na rubu pokazuje smjer i kut do njega, a žuti obris pokazuje kako će prijeći preko diska.</p>
            <p class="l-en">For the selected aircraft, the panel shows a countdown to alignment, the distance, a <b>Shot feasibility</b> rating (EXCELLENT, FAIR or POOR) and the <b>Elevation gap at alignment</b>. Minus means the aircraft passes below the Moon, plus means above. The viewfinder preview draws the Moon in its phase for that moment and the aircraft at its true size for your lens. While the aircraft is outside the frame, an edge arrow shows its direction and angle, and a yellow outline shows how it will cross the disc.</p>
            <div class="vf-wrap">
              <svg class="vf" viewBox="0 0 300 200" role="img" aria-label="">
                <defs>
                  <radialGradient id="vfMoon" cx="42%" cy="40%" r="62%"><stop offset="0" stop-color="#eeeee6"></stop><stop offset=".75" stop-color="#c9c8c0"></stop><stop offset="1" stop-color="#9c9b94"></stop></radialGradient>
                  <clipPath id="vfClip"><circle cx="150" cy="100" r="62"></circle></clipPath>
                </defs>
                <rect width="300" height="200" fill="#000"></rect>
                <circle cx="150" cy="100" r="62" fill="url(#vfMoon)"></circle>
                <g clip-path="url(#vfClip)" fill="#7d7d78" opacity=".5">
                  <ellipse cx="128" cy="82" rx="20" ry="14"></ellipse><ellipse cx="166" cy="78" rx="14" ry="10"></ellipse><ellipse cx="160" cy="118" rx="22" ry="12"></ellipse><circle cx="132" cy="126" r="6"></circle><circle cx="180" cy="104" r="4"></circle>
                </g>
                <g transform="translate(150 96) rotate(-14)">
                  <line x1="-95" y1="0" x2="95" y2="0" stroke="#f2c14e" stroke-width="1" stroke-dasharray="4 4" opacity=".7"></line>
                  <path d="M 13 0 L 8 -1.4 L -1 -1.4 L -6 -9 L -9 -9 L -5 -1.4 L -11 -1.4 L -14 -5 L -16 -5 L -15 0 L -16 5 L -14 5 L -11 1.4 L -5 1.4 L -9 9 L -6 9 L -1 1.4 L 8 1.4 Z" fill="none" stroke="#f2c14e" stroke-width="1.4"></path>
                </g>
                <g transform="translate(18 120)">
                  <path d="M 0 0 L 14 -8 L 14 8 Z" fill="#4fd1e8"></path>
                  <text x="20" y="4" font-family="JetBrains Mono, monospace" font-size="11" fill="#4fd1e8">4.5°</text>
                </g>
                <text x="288" y="18" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="11" fill="#eaeef7">T−12 s</text>
                <text x="12" y="190" font-family="JetBrains Mono, monospace" font-size="9" fill="#a6b0c6">600 mm · FF</text>
              </svg>
              <div class="vf-legend">
                <div><i style="background:#4fd1e8"></i><span class="l-hr">strelica i kut: gdje je avion sada</span><span class="l-en">arrow and angle: where the aircraft is now</span></div>
                <div><i style="background:#f2c14e"></i><span class="l-hr">žuti obris: veličina i smjer prelaska</span><span class="l-en">yellow outline: size and crossing direction</span></div>
                <div><i style="background:#eaeef7"></i><span class="l-hr">odbrojavanje do poravnanja</span><span class="l-en">countdown to alignment</span></div>
              </div>
            </div>
          </div>
        </li>
        <li class="gstep">
          <div class="gnum">10</div>
          <div class="gbody">
            <h3><span class="l-hr">Nađite ga na nebu</span><span class="l-en">Find it in the sky</span></h3>
            <div class="chips"><span class="chip-ui">Field overlays → Open AR sky overlay</span><span class="chip-ui">Cal ☽</span></div>
            <p class="l-hr">AR prikaz otvara kameru mobitela s oznakama aviona i njihovim kutom iznad horizonta, npr. <span class="mono">THY3VD +12°</span>. Avioni izvan kadra dobiju strelice na rubu. Kompas mobitela zna lagati kraj metala i armiranog betona, a značka točnosti tada pocrveni. Dodirnite <b>Cal ☽</b>, zatim Mjesec na zaslonu, i aplikacija ispravi sve oznake.</p>
            <p class="l-en">The AR view opens your phone camera with aircraft labels and their angle above the horizon, e.g. <span class="mono">THY3VD +12°</span>. Aircraft outside the frame get edge arrows. The phone compass can be thrown off near metal and reinforced concrete, and the accuracy badge turns red. Tap <b>Cal ☽</b>, then the Moon on the screen, and the app corrects all labels.</p>
          </div>
        </li>
        <li class="gstep">
          <div class="gnum">11</div>
          <div class="gbody">
            <h3><span class="l-hr">Okinite</span><span class="l-en">Press the shutter</span></h3>
            <div class="chips"><span class="chip-ui">Photographer → Field sounds</span><span class="chip-ui">Sounds on</span></div>
            <p class="l-hr">Uključite <b>Sounds on</b>. Na iPhoneu prvo isključite tihi način rada i pojačajte zvono. Nakon toga ne morate gledati u mobitel, nego vas vode zvukovi:</p>
            <p class="l-en">Turn on <b>Sounds on</b>. On iPhone, first switch off silent mode and turn up the ringer. From then on you do not need to look at the phone; the sounds guide you:</p>
            <div class="sound-line" aria-hidden="true">
              <div class="sl-track"></div>
              <div class="sl-ev" style="--x: 6%"><i class="s-chime"></i><span class="l-hr">zvonce: avion pozeleni</span><span class="l-en">chime: aircraft turns green</span></div>
              <div class="sl-ev" style="--x: 38%"><i class="s-hold"></i><span class="l-hr">tihi ton: u zoni diska</span><span class="l-en">soft tone: in the disc zone</span></div>
              <div class="sl-ev" style="--x: 70%"><i class="s-beep"></i><span class="l-hr">signal ~3 s prije</span><span class="l-en">beep ~3 s before</span></div>
              <div class="sl-ev" style="--x: 94%"><i class="s-shot"></i><span class="l-hr">poravnanje</span><span class="l-en">alignment</span></div>
            </div>
            <ul class="sound-list">
              <li><i class="s-chime"></i><span class="l-hr"><b>Zvonce:</b> odabrani avion je ušao u zelenu zonu.</span><span class="l-en"><b>Chime:</b> the selected aircraft has entered the green zone.</span></li>
              <li><i class="s-hold"></i><span class="l-hr"><b>Tihi ton:</b> traje dok je avion u zoni preklapanja s diskom.</span><span class="l-en"><b>Soft tone:</b> lasts while the aircraft is in the disc overlap zone.</span></li>
              <li><i class="s-beep"></i><span class="l-hr"><b>Signal:</b> oko 3 sekunde prije poravnanja. Tada krenite s rafalom.</span><span class="l-en"><b>Beep:</b> about 3 seconds before alignment. Start your burst now.</span></li>
              <li><i class="s-shot"></i><span class="l-hr"><b>Signal poravnanja:</b> avion je na Mjesecu.</span><span class="l-en"><b>Alignment beep:</b> the aircraft is on the Moon.</span></li>
            </ul>
            <div class="card tips">
              <div class="tag" style="--c: var(--radio)"><span class="l-hr">Fotografski savjeti (nisu dio aplikacije)</span><span class="l-en">Photo tips (not part of the app)</span></div>
              <ul class="l-hr">
                <li>Avion prijeđe preko diska za djelić sekunde do sekunde, ovisno o udaljenosti. Nema vremena za traženje.</li>
                <li>Stativ, ručni fokus na rub Mjeseca i ručna ekspozicija za Mjesec. Avion će ispasti kao silueta.</li>
                <li>Kratka ekspozicija, 1/1000 s ili kraće, da avion ne bude razmazan.</li>
                <li>Rafal počnite sekundu-dvije prije poravnanja i držite ga dok avion ne izađe s diska.</li>
              </ul>
              <ul class="l-en">
                <li>The aircraft crosses the disc in a fraction of a second to a second, depending on distance. There is no time to search.</li>
                <li>Tripod, manual focus on the Moon's edge and manual exposure for the Moon. The aircraft will come out as a silhouette.</li>
                <li>Short exposure, 1/1000 s or faster, so the aircraft is not blurred.</li>
                <li>Start the burst a second or two before alignment and hold it until the aircraft leaves the disc.</li>
              </ul>
            </div>
          </div>
        </li>
      </ol>
    </div>
  </section>
  <div class="part-break">
    <div class="tag" style="--c: var(--data)"><span class="l-hr">Kako to radi iznutra</span><span class="l-en">How it works inside</span></div>
    <p class="muted"><span class="l-hr">Ako vas zanima što se događa iza karte, od radio signala do izračuna, nastavite čitati.</span><span class="l-en">If you are curious about what happens behind the map, from the radio signal to the calculations, read on.</span></p>
  </div>
  <section class="ch" id="avion" style="--c: var(--radio)">
    <div class="ch-head">
      <div class="ch-num">01</div>
      <div class="tag"><span class="l-hr l-w">U avionu</span><span class="l-en l-w">On board</span></div>
      <h2><span class="l-hr l-w">Avion zna gdje je i to javlja svima</span><span class="l-en l-w">The aircraft knows where it is and tells everyone</span></h2>
    </div>
    <div class="split">
      <div class="prose">
        <p><span class="l-hr l-w">U avionu je GPS prijamnik, isti onaj princip kao u mobitelu, samo precizniji. On zna <strong>geografsku širinu i dužinu</strong>. Visinu mjeri barometar, iz tlaka zraka. Navigacijsko računalo zna <strong>brzinu i smjer</strong> kretanja.</span><span class="l-en l-w">The aircraft carries a GPS receiver, the same principle as in your phone, only more precise. It knows its <strong>latitude and longitude</strong>. Altitude comes from a barometer that measures air pressure. The navigation computer knows the <strong>speed and direction</strong> of travel.</span></p>
        <p><span class="l-hr l-w">Uređaj koji se zove <strong>transponder</strong> te podatke stalno pretvara u kratke radio poruke i šalje ih na sve strane. Nitko ga ne mora pitati, nego se sam javlja. Zato se sustav zove <strong>ADS-B</strong>:</span><span class="l-en l-w">A device called a <strong>transponder</strong> keeps turning this data into short radio messages and sends them in every direction. Nobody has to ask; it reports on its own. That is why the system is called <strong>ADS-B</strong>:</span></p>
        <p><span class="l-hr l-w"><span class="mono" style="color: var(--radio)">A</span>utomatic (sam od sebe) · <span class="mono" style="color: var(--radio)">D</span>ependent (ovisi o GPS-u aviona) · <span class="mono" style="color: var(--radio)">S</span>urveillance (praćenje) · <span class="mono" style="color: var(--radio)">B</span>roadcast (emitira svima).</span><span class="l-en l-w"><span class="mono" style="color: var(--radio)">A</span>utomatic (on its own) · <span class="mono" style="color: var(--radio)">D</span>ependent (relies on the aircraft's GPS) · <span class="mono" style="color: var(--radio)">S</span>urveillance (tracking) · <span class="mono" style="color: var(--radio)">B</span>roadcast (sent to everyone).</span></p>
        <p><span class="l-hr l-w">Možete ga zamisliti kao da avion stalno viče u prazno „Ja sam 4840D6, na 11 000 metara, letim na jugoistok brzinom 830 km/h!”. Tko ima uho za tu frekvenciju, čuje ga. Od 2020. ADS-B je obavezan za gotovo sve putničke avione u Europi i SAD-u.</span><span class="l-en l-w">Picture the aircraft constantly calling out: “I am 4840D6, at 11,000 metres, heading south-east at 830 km/h!” Anyone tuned to that frequency can hear it. Since 2020, ADS-B has been mandatory for almost all passenger aircraft in Europe and the US.</span></p>
      </div>
      <div class="card">
        <h3><span class="l-hr l-w">Klasični radar ili ADS-B?</span><span class="l-en l-w">Classic radar or ADS-B?</span></h3>
        <div class="scroll-x">
          <table class="compare">
            <thead><tr><th></th><th>Radar</th><th>ADS-B</th></tr></thead>
            <tbody>
              <tr><td><span class="l-hr l-w">Tko određuje položaj</span><span class="l-en l-w">Who determines the position</span></td><td><span class="l-hr l-w">Zemlja: radar mjeri odbijeni signal</span><span class="l-en l-w">The ground: radar measures the reflected signal</span></td><td><span class="l-hr l-w">Avion sam, preko GPS-a</span><span class="l-en l-w">The aircraft itself, via GPS</span></td></tr>
              <tr><td><span class="l-hr l-w">Koliko često</span><span class="l-en l-w">How often</span></td><td><span class="l-hr l-w">Jednom u 4 do 12 s, kad se antena okrene</span><span class="l-en l-w">Once every 4 to 12 s, as the antenna turns</span></td><td><span class="l-hr l-w">Otprilike dvaput u sekundi</span><span class="l-en l-w">About twice a second</span></td></tr>
              <tr><td><span class="l-hr l-w">Točnost</span><span class="l-en l-w">Accuracy</span></td><td><span class="l-hr l-w">Stotine metara na daljinu</span><span class="l-en l-w">Hundreds of metres at long range</span></td><td><span class="l-hr l-w">Desetak metara</span><span class="l-en l-w">About ten metres</span></td></tr>
              <tr><td><span class="l-hr l-w">Tko može slušati</span><span class="l-en l-w">Who can listen</span></td><td><span class="l-hr l-w">Samo kontrola leta</span><span class="l-en l-w">Air traffic control only</span></td><td><span class="l-hr l-w">Svatko s antenom od 30 €</span><span class="l-en l-w">Anyone with a €30 antenna</span></td></tr>
              <tr><td><span class="l-hr l-w">Cijena prijamnika</span><span class="l-en l-w">Receiver cost</span></td><td><span class="l-hr l-w">Milijuni eura</span><span class="l-en l-w">Millions of euros</span></td><td><span class="l-hr l-w">Malo računalo i USB prijamnik</span><span class="l-en l-w">A small computer and a USB receiver</span></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
  <section class="ch" id="poruka" style="--c: var(--radio)">
    <div class="ch-head">
      <div class="ch-num">02</div>
      <div class="tag"><span class="l-hr l-w">Unutar jedne poruke</span><span class="l-en l-w">Inside one message</span></div>
      <h2><span class="l-hr l-w">Što piše u 112 nula i jedinica</span><span class="l-en l-w">What 112 ones and zeros say</span></h2>
    </div>
    <div class="prose">
      <p><span class="l-hr l-w">Jedna poruka traje samo 120 milijuntih dijelova sekunde i ima točno 112 bita. Ispod je prava poruka koju je uhvatila antena. Zapisana heksadecimalno, izgleda kao besmislen niz znakova, ali svaki dio ima svoje značenje. Odaberite dio poruke i pogledajte kako se dekodira.</span><span class="l-en l-w">A single message lasts just 120 millionths of a second and is exactly 112 bits long. Below is a real message picked up by an antenna. Written in hexadecimal it looks like gibberish, but every part has a meaning. Pick a part of the message to see how it is decoded.</span></p>
    </div>
    <div class="card" style="gap: 18px">
      <div class="hex" id="hex" aria-hidden="true"></div>
      <div class="bitgrid" id="bitgrid" aria-hidden="true"></div>
      <div class="fields" id="fields" role="group" aria-label="Dijelovi poruke"></div>
      <div class="decode" id="decode" aria-live="polite"></div>
    </div>
    <div class="cards">
      <div class="card" style="--c: var(--radio)"><h3><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"></path><circle cx="12" cy="10" r="2.5"></circle></svg></span><span class="l-hr">Poruka s pozicijom</span><span class="l-en">Position message</span></h3><p><span class="l-hr l-w">Širina, dužina i visina. Pozicija je komprimirana, pa prijamnik spoji dvije uzastopne poruke („parnu” i „neparnu”) da izračuna točno mjesto.</span><span class="l-en l-w">Latitude, longitude and altitude. The position is compressed, so the receiver combines two consecutive messages (an “even” and an “odd” one) to work out the exact location.</span></p></div>
      <div class="card" style="--c: var(--radio)"><h3><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h12M12 6l6 6-6 6"></path></svg></span><span class="l-hr">Poruka s brzinom</span><span class="l-en">Velocity message</span></h3><p><span class="l-hr l-w">Brzina preko tla, smjer kretanja (kurs) i koliko se brzo avion penje ili spušta.</span><span class="l-en l-w">Ground speed, direction of travel (track) and how fast the aircraft is climbing or descending.</span></p></div>
      <div class="card" style="--c: var(--radio)"><h3><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="M7 10h4M7 14h7"></path></svg></span><span class="l-hr">Poruka s imenom</span><span class="l-en">Identification message</span></h3><p><span class="l-hr l-w">Pozivni znak leta, npr. <span class="mono">KLM1023</span> ili <span class="mono">CTN472</span>. Šalje se rjeđe, otprilike svakih 5 sekundi.</span><span class="l-en l-w">The flight's callsign, e.g. <span class="mono">KLM1023</span> or <span class="mono">CTN472</span>. Sent less often, roughly every 5 seconds.</span></p></div>
    </div>
  </section>
  <section class="ch" id="antena" style="--c: var(--radio)">
    <div class="ch-head">
      <div class="ch-num">03</div>
      <div class="tag"><span class="l-hr l-w">Vlastita stanica</span><span class="l-en l-w">Own station</span></div>
      <h2><span class="l-hr l-w">Vlastita prijamna stanica</span><span class="l-en l-w">The own receiving station</span></h2>
    </div>
    <div class="split">
      <div class="prose">
        <p><span class="l-hr l-w">Signal na 1090 MHz može uhvatiti svatko tko ima antenu i prijamnik. Zato LunaPic ne ovisi o tuđim podacima, nego ima <strong>vlastitu ADS-B stanicu</strong> na konačnoj lokaciji, s antenom vani i otvorenim pogledom na nebo. To je njegov glavni izvor podataka.</span><span class="l-en l-w">Anyone with an antenna and a receiver can pick up the 1090 MHz signal. So LunaPic does not depend on other people's data: it has its <strong>own ADS-B station</strong> at its final site, with an outdoor antenna and an open view of the sky. This is its main data source.</span></p>
        <p><span class="l-hr l-w"><strong style="color: var(--radio)">LunaPic ADS-B</strong> je Raspberry Pi s USB radio prijamnikom (RTL-SDR). Softver na njemu dekodira poruke i stalno osvježava popis aviona u dometu, isti onaj koji se vidi na karti tar1090.</span><span class="l-en l-w"><strong style="color: var(--radio)">LunaPic ADS-B</strong> is a Raspberry Pi with a USB radio receiver (RTL-SDR). Its software decodes the messages and keeps updating the list of aircraft in range, the same list you see on the tar1090 map.</span></p>
        <p><span class="l-hr l-w">Avione na velikoj visini stanica vidi do oko <strong>350 km</strong>, a nisko letove puno bliže, jer horizont i teren zaklanjaju signal. Za fotografiranje oko Zagreba to je dovoljno. Ako snimate daleko od njega, prijamnik možda ne doseže to područje, pa uključite javni izvor.</span><span class="l-en l-w">The station sees high-flying aircraft out to about <strong>350 km</strong> and low traffic much closer, because the horizon and terrain block the signal. That is enough for shooting around Zagreb. If you shoot far away from it, the receiver may not reach that area, so turn on a public source.</span></p>
      </div>
      <div class="card">
        <div class="tag" style="--c: var(--radio)"><span class="l-hr l-w">Jedna antena, cijelo nebo</span><span class="l-en l-w">One antenna, the whole sky</span></div>
        <svg viewBox="0 0 320 210" width="100%" role="img" aria-label="Zgrada s antenom; unutra Raspberry Pi; podaci idu preko interneta na LunaPic server">
          <path d="M150 40 C 190 10, 250 10, 300 40" fill="none" stroke="var(--radio)" stroke-width="1.5" opacity=".35"></path>
          <path d="M140 52 C 190 15, 260 15, 312 52" fill="none" stroke="var(--radio)" stroke-width="1.5" opacity=".2"></path>
          <path d="M40 200 V110 L120 60 L200 110 V200 Z" fill="var(--panel-2)" stroke="var(--line)" stroke-width="1.5"></path>
          <line x1="150" y1="78" x2="150" y2="40" stroke="var(--ink)" stroke-width="2"></line>
          <circle cx="150" cy="38" r="3.5" fill="var(--radio)"></circle>
          <text x="160" y="44" font-family="JetBrains Mono, monospace" font-size="10" fill="var(--muted)"><tspan class="l-hr">antena</tspan><tspan class="l-en">antenna</tspan></text>
          <rect x="60" y="130" width="60" height="26" rx="5" fill="var(--panel)" stroke="var(--radio)"></rect>
          <text x="90" y="147" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" fill="var(--ink)">Pi + SDR</text>
          <rect x="138" y="150" width="46" height="24" rx="5" fill="var(--panel)" stroke="var(--data)"></rect>
          <text x="161" y="166" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" fill="var(--data)">router</text>
          <path d="M120 143 L138 158" stroke="var(--data)" stroke-width="1.5" fill="none"></path>
          <path d="M184 162 C 230 162, 250 140, 290 140" stroke="var(--data)" stroke-width="1.5" stroke-dasharray="3 4" fill="none"></path>
          <rect x="262" y="118" width="48" height="44" rx="6" fill="var(--panel)" stroke="var(--data)"></rect>
          <text x="286" y="136" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="9" fill="var(--ink)">LunaPic</text>
          <text x="286" y="150" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="9" fill="var(--ink)">server</text>
          <text x="225" y="188" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" fill="var(--muted)">internet</text>
        </svg>
      </div>
    </div>
    <div class="card">
      <div class="tag" style="--c: var(--radio)"><span class="l-hr l-w">Put od antene do servera</span><span class="l-en l-w">From antenna to server</span></div>
      <div class="chain">
        <div class="node" style="--c: var(--radio)"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M8 21l4-8 4 8"></path><path d="M6 6a8 8 0 0 0 0 8M18 6a8 8 0 0 1 0 8"></path></svg></span><div><b><span class="l-hr l-w">Antena</span><span class="l-en l-w">Antenna</span></b><small><span class="l-hr l-w">Vani, s što više otvorenog neba. Zgrade i drveće skraćuju domet.</span><span class="l-en l-w">Outdoors, with as much open sky as possible. Buildings and trees cut the range.</span></small></div></div>
        <div class="node" style="--c: var(--radio)"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="3" width="10" height="18" rx="2"></rect><path d="M10 7h4"></path></svg></span><div><b><span class="l-hr l-w">Prijamnik</span><span class="l-en l-w">Receiver</span></b><small><span class="l-hr l-w">Radio val pretvara u digitalni zapis.</span><span class="l-en l-w">Turns the radio wave into a digital signal.</span></small></div></div>
        <div class="node" style="--c: var(--radio)"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M7 9h2M7 13h2M12 9h5M12 13h5"></path></svg></span><div><b><span class="l-hr l-w">Mini računalo</span><span class="l-en l-w">Small computer</span></b><small><span class="l-hr l-w">Dekodira poruke i slaže popis aviona u blizini.</span><span class="l-en l-w">Decodes the messages and builds a list of nearby aircraft.</span></small></div></div>
        <div class="node" style="--c: var(--data)"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14l4-4 4 4 8-8"></path><path d="M14 6h6v6"></path></svg></span><div><b><span class="l-hr l-w">Slanje</span><span class="l-en l-w">Sending</span></b><small><span class="l-hr l-w">Svakih nekoliko sekundi uređaj sam pošalje popis na server preko interneta.</span><span class="l-en l-w">Every few seconds, the device pushes the list to the server over the internet.</span></small></div></div>
        <div class="node" style="--c: var(--data)"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="6" rx="7" ry="3"></ellipse><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"></path></svg></span><div><b>Server</b><small><span class="l-hr l-w">Prima popis, prikazuje ga u aplikaciji i sprema u bazu.</span><span class="l-en l-w">Receives the list, shows it in the app and stores it in the database.</span></small></div></div>
      </div>
    </div>
    <div class="cards">
      <div class="card" style="--c: var(--radio)"><h3><span class="l-hr l-w">Zašto vlastita stanica</span><span class="l-en l-w">Why an own station</span></h3><p><span class="l-hr l-w">Javni servisi kasne, imaju dnevna ograničenja i znaju se ugasiti ili odbiti pristup. Vlastiti podaci se uz to smiju spremati i obrađivati, pa tako nastaju statistika prometa i linije preleta.</span><span class="l-en l-w">Public services lag behind, have daily limits and can shut down or refuse access. Your own data can also be stored and processed, which is what makes traffic statistics and flight tracks possible.</span></p></div>
      <div class="card" style="--c: var(--radio)"><h3><span class="l-hr l-w">Zašto stanica šalje, a server ne pita</span><span class="l-en l-w">Why the station sends instead of the server asking</span></h3><p><span class="l-hr l-w">Lokalna mreža je zatvorena prema van, i tako treba ostati. Zato uređaj sam šalje podatke serveru, a ništa izvana ne mora ulaziti u mrežu.</span><span class="l-en l-w">The local network is closed to the outside, and it should stay that way. So the device sends data to the server itself, and nothing from outside has to get in.</span></p></div>
    </div>
  </section>
  <section class="ch" id="izvori" style="--c: var(--data)">
    <div class="ch-head">
      <div class="ch-num">04</div>
      <div class="tag"><span class="l-hr l-w">Tri izvora</span><span class="l-en l-w">Three sources</span></div>
      <h2><span class="l-hr l-w">Vlastiti prijamnik, javne mreže kao rezerva</span><span class="l-en l-w">Own receiver, public networks as backup</span></h2>
    </div>
    <div class="card">
      <div class="scroll-x">
        <table class="compare">
          <thead><tr><th><span class="l-hr l-w">Izvor</span><span class="l-en l-w">Source</span></th><th><span class="l-hr l-w">Što je</span><span class="l-en l-w">What it is</span></th><th><span class="l-hr l-w">Kako stiže</span><span class="l-en l-w">How data arrives</span></th><th><span class="l-hr l-w">Ograničenje</span><span class="l-en l-w">Limit</span></th></tr></thead>
          <tbody>
            <tr><td><strong style="color: var(--radio)">LunaPic ADS-B</strong></td><td><span class="l-hr l-w">Vlastiti Raspberry Pi s antenom</span><span class="l-en l-w">Own Raspberry Pi with an antenna</span></td><td><span class="l-hr l-w">Sam šalje svakih nekoliko sekundi, uključen je zadano</span><span class="l-en l-w">Sends on its own every few seconds, on by default</span></td><td><span class="l-hr l-w">Nema, vlastiti hardver</span><span class="l-en l-w">None, own hardware</span></td></tr>
            <tr><td><strong>OpenSky</strong></td><td><span class="l-hr l-w">Neprofitna istraživačka mreža tisuća antena</span><span class="l-en l-w">Non-profit research network of thousands of antennas</span></td><td><span class="l-hr l-w">Server pita svakih 30 s, ako ga uključite</span><span class="l-en l-w">The server asks every 30 s, if you turn it on</span></td><td><span class="l-hr l-w">Ograničen broj upita dnevno</span><span class="l-en l-w">Limited number of requests per day</span></td></tr>
            <tr><td><strong>adsb.lol</strong></td><td><span class="l-hr l-w">Otvorena zajednica volontera</span><span class="l-en l-w">Open community of volunteers</span></td><td><span class="l-hr l-w">Server pita svakih 30 s, ako ga uključite</span><span class="l-en l-w">The server asks every 30 s, if you turn it on</span></td><td><span class="l-hr l-w">Bez ključa, samo nekomercijalno</span><span class="l-en l-w">No key, non-commercial use only</span></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="split">
      <div class="prose">
        <p><span class="l-hr l-w">Pri otvaranju je uključen samo <strong>LunaPic ADS-B</strong>. OpenSky i adsb.lol su rezerva koju uključite sami u panelu <strong>Flight source</strong>. Izbor se ne pamti, pa svaki posjet kreće od vlastitog prijamnika.</span><span class="l-en l-w">On opening, only <strong>LunaPic ADS-B</strong> is on. OpenSky and adsb.lol are a backup you turn on yourself in the <strong>Flight source</strong> panel. The choice is not remembered, so every visit starts from the own receiver.</span></p>
        <p><span class="l-hr l-w"><strong>Nema automatskog prebacivanja.</strong> Ako prijamnik utihne, izvor dobije oznaku offline i karta ostaje prazna dok ne uključite javni izvor. To je namjerno: javne pozicije kasne do 30 sekundi i pokvarile bi odbrojavanje.</span><span class="l-en l-w"><strong>No automatic switch.</strong> If the receiver goes silent, the source shows offline and the map stays empty until you turn on a public source. This is deliberate: public positions lag by up to 30 seconds and would spoil the countdown.</span></p>
        <p><span class="l-hr l-w"><strong>Spajanje.</strong> Kad uključite i javne mreže, avioni se prepoznaju po adresi (<span class="mono">icao24</span>). Za avione koje vidi vlastiti prijamnik njegov položaj uvijek ima prednost, a javne mreže samo nadopunjuju aviokompaniju i tip aviona. Ostale avione javne mreže donose na kartu.</span><span class="l-en l-w"><strong>Merging.</strong> When you turn on public networks too, aircraft are matched by their address (<span class="mono">icao24</span>). For aircraft the receiver can see, its position always takes priority, and public networks only fill in the airline and aircraft type. They bring all other aircraft onto the map.</span></p>
      </div>
      <div class="card">
        <div class="tag" style="--c: var(--data)"><span class="l-hr l-w">Primjer spajanja</span><span class="l-en l-w">Merge example</span></div>
        <div class="mini"><span class="l-hr l-w">4840d6  <span class="r">LunaPic ADS-B</span>  45.912, 16.204  <span class="g">✓ položaj</span>
4840d6  OpenSky        45.905, 16.190  starije
4840d6  adsb.lol       tip: B738       <span class="g">✓ dopuna</span>
        ↓
<span class="a">4840d6  KLM1023  45.912, 16.204  B738</span></span><span class="l-en l-w">4840d6  <span class="r">LunaPic ADS-B</span>  45.912, 16.204  <span class="g">✓ position</span>
4840d6  OpenSky        45.905, 16.190  older 
4840d6  adsb.lol       type: B738       <span class="g">✓ fill-in</span>
        ↓
<span class="a">4840d6  KLM1023  45.912, 16.204  B738</span></span></div>
        <p class="muted" style="font-size:0.88rem"><span class="l-hr l-w">Ilustrativan primjer. Pravilo je stvarno: položaj daje vlastiti prijamnik, a javne mreže popunjavaju praznine.</span><span class="l-en l-w">Illustrative example. The rule is real: the own receiver provides the position, public networks fill the gaps.</span></p>
      </div>
    </div>
    <p class="muted" style="font-size:0.95rem; max-width: 70ch"><span class="l-hr l-w">Usput: javni izvori se mijenjaju. ADS-B One je 2026. ugašen, a Airplanes.live se zatvorio za nove korisnike. Zato LunaPic danas koristi adsb.lol, koji vodi drugi tim, s istim formatom podataka. Upravo je to dobar razlog za vlastitu stanicu.</span><span class="l-en l-w">By the way, public sources change. ADS-B One shut down in 2026, and Airplanes.live closed to new users. That is why LunaPic now uses adsb.lol, run by a different team, with the same data format. It is also a good reason to have your own station.</span></p>
  </section>
  <section class="ch" id="server" style="--c: var(--data)">
    <div class="ch-head">
      <div class="ch-num">05</div>
      <div class="tag">LunaPic server</div>
      <h2><span class="l-hr l-w">Server radi i kad aplikacija nije otvorena</span><span class="l-en l-w">The server keeps working when the app is closed</span></h2>
    </div>
    <div class="prose">
      <p><span class="l-hr l-w">LunaPic radi na vlastitom serveru, koji ima dva posla. Kad je aplikacija otvorena, predaje joj podatke prijamnika i po potrebi pita javne mreže, jer ih preglednik ne smije zvati izravno. Uz to danju i noću radi <strong>zapisivač letova</strong>.</span><span class="l-en l-w">LunaPic runs on its own server, which has two jobs. When the app is open, it hands over the receiver's data and asks public networks when needed, because the browser is not allowed to call them directly. On top of that, a <strong>flight logger</strong> runs day and night.</span></p>
    </div>
    <div class="arch">
      <div class="box">
        <span class="tag" style="--c: var(--radio)"><span class="l-hr l-w">Izvori</span><span class="l-en l-w">Sources</span></span>
        <b><span class="l-hr l-w">Prijamnik i mreže</span><span class="l-en l-w">Receiver and networks</span></b>
        <small><span class="l-hr l-w">LunaPic ADS-B sam šalje svoj popis. OpenSky i adsb.lol odgovaraju kad ih server pita.</span><span class="l-en l-w">LunaPic ADS-B pushes its own list. OpenSky and adsb.lol answer when the server asks.</span></small>
        <code>Raspberry Pi → server</code>
      </div>
      <div class="arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h14l-4-4M18 12l-4 4"></path></svg></div>
      <div class="box">
        <span class="tag" style="--c: var(--data)">LunaPic server</span>
        <b><span class="l-hr l-w">Zapisivač + posrednik</span><span class="l-en l-w">Logger + go-between</span></b>
        <small><span class="l-hr l-w">Redovito upisuje pozicije s prijamnika u bazu, dopunjuje tip aviona i provjerava ima li tranzita. Aplikaciji predaje podatke.</span><span class="l-en l-w">Regularly writes the receiver's positions to the database, fills in the aircraft type and checks for transits. Hands the data to the app.</span></small>
        <code><span class="l-hr l-w">baza letova</span><span class="l-en l-w">flight database</span></code>
      </div>
      <div class="arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h14l-3-3M20 15H6l3 3"></path></svg></div>
      <div class="box">
        <span class="tag" style="--c: var(--ok)"><span class="l-hr l-w">Vaš mobitel</span><span class="l-en l-w">Your phone</span></span>
        <b>LunaPic</b>
        <small><span class="l-hr l-w">Prati avione do 185 km oko vas, a tranzite traži unutar 100 km. Kad je aplikacija zatvorena, server vam može poslati obavijest.</span><span class="l-en l-w">Follows aircraft up to 185 km around you and looks for transits within 100 km. When the app is closed, the server can send you a notification.</span></small>
        <code><span class="l-hr l-w">karta · obavijesti</span><span class="l-en l-w">map · notifications</span></code>
      </div>
    </div>
    <div class="cards">
      <div class="card"><h3><span class="l-hr l-w">Pametno zapisivanje</span><span class="l-en l-w">Smart logging</span></h3><p><span class="l-hr l-w">Pozicija se ne sprema svaki put. Ako se avion nije dovoljno pomaknuo, zapis se preskoči. Tako baza ostaje upotrebljiva i kad naraste na milijune redaka.</span><span class="l-en l-w">Not every position is stored. If the aircraft has not moved far enough, the entry is skipped. That keeps the database usable even when it grows to millions of rows.</span></p></div>
      <div class="card"><h3><span class="l-hr l-w">Obavijesti dok spavate</span><span class="l-en l-w">Alerts while you sleep</span></h3><p><span class="l-hr l-w">Nakon svakog očitanja server sam provjeri hoće li neki avion proći ispred Mjeseca. Ako se pretplatite na obavijesti, šalje ih na mobitel i kad LunaPic nije otvoren.</span><span class="l-en l-w">After every reading, the server itself checks whether an aircraft is about to pass in front of the Moon. If you subscribe to notifications, it sends them to your phone even when LunaPic is not open.</span></p></div>
      <div class="card"><h3><span class="l-hr l-w">Kad izvor zakaže</span><span class="l-en l-w">When a source fails</span></h3><p><span class="l-hr l-w">Ako prijamnik utihne, u aplikaciji se pojavi oznaka „offline”, a nakon 5 minuta svi pretplatnici dobiju obavijest, i još jednu kad se podaci vrate. Dok prijamnik šuti, nema ni upozorenja o tranzitima. Javna mreža koja ne odgovara dobiva oznaku „rate limited” ili „unavailable”.</span><span class="l-en l-w">If the receiver goes silent, the app shows “offline”, and after 5 minutes every subscriber gets a notification, plus another when data returns. While the receiver is silent there are no transit alerts either. A public network that stops responding shows “rate limited” or “unavailable”.</span></p></div>
    </div>
  </section>
  <section class="ch" id="obrada" style="--c: var(--data)">
    <div class="ch-head">
      <div class="ch-num">06</div>
      <div class="tag"><span class="l-hr l-w">Obrada u aplikaciji</span><span class="l-en l-w">Processing in the app</span></div>
      <h2><span class="l-hr l-w">Od popisa aviona do kandidata za tranzit</span><span class="l-en l-w">From a list of aircraft to transit candidates</span></h2>
    </div>
    <div class="pipeline">
      <div class="card">
        <div class="tag" style="--c: var(--data)"><span class="l-hr l-w">osvježavanje</span><span class="l-en l-w">refreshing</span></div>
        <h3><span class="l-hr l-w">Dva ritma</span><span class="l-en l-w">Two rhythms</span></h3>
        <p class="muted"><span class="l-hr l-w">Vlastiti prijamnik aplikacija pita svakih nekoliko sekundi, a javne mreže svakih 30 s, da dnevno ograničenje upita potraje. Kad tab nije vidljiv, sve stoji.</span><span class="l-en l-w">The app asks the own receiver every few seconds and public networks every 30 s, so the daily request limit lasts. When the tab is not visible, everything stops.</span></p>
        <div class="mini">LunaPic ADS-B  <span class="g">par s</span>
OpenSky, lol   <span class="r">30 s</span></div>
      </div>
      <div class="card">
        <div class="tag" style="--c: var(--data)"><span class="l-hr l-w">filtriranje</span><span class="l-en l-w">filtering</span></div>
        <h3><span class="l-hr l-w">Krugovi od 185 i 100 km</span><span class="l-en l-w">Circles of 185 and 100 km</span></h3>
        <p class="muted"><span class="l-hr l-w">Na karti ostaju avioni do 185 km oko vas i oni u vidljivom dijelu karte, pa zumiranje ne izbacuje avion iz praćenja. Sam tranzit računa se samo ako bi se dogodio unutar 100 km. Dodatno možete filtrirati po visini, tipu aviona ili pretraživanjem.</span><span class="l-en l-w">The map keeps aircraft up to 185 km around you and those in the visible area, so zooming never drops a tracked aircraft. A transit only counts if it would happen within 100 km. You can also filter by altitude, aircraft type or search.</span></p>
        <div class="mini"><span class="l-hr l-w">praćenje do           <span class="a">185 km</span>
tranzit do          <span class="a">100 km</span>
filtar visine         skala Altitude
filtar tipa           Flight Filters</span><span class="l-en l-w">tracked up to          <span class="a">185 km</span>
transit within      <span class="a">100 km</span>
altitude filter         Altitude scale
type filter            Flight Filters</span></div>
      </div>
      <div class="card">
        <div class="tag" style="--c: var(--data)"><span class="l-hr l-w">pamćenje</span><span class="l-en l-w">memory</span></div>
        <h3><span class="l-hr l-w">Bez treperenja</span><span class="l-en l-w">No flicker</span></h3>
        <p class="muted"><span class="l-hr l-w">Ako avion nakratko nestane iz odgovora javne mreže, ostaje na karti još do ~32 s. Kod vlastitog prijamnika nema tog zadržavanja: avion nestaje čim prijamnik izgubi njegov signal.</span><span class="l-en l-w">If an aircraft briefly drops out of a public network's response, it stays on the map for up to ~32 s. The own receiver has no such delay: an aircraft disappears as soon as the receiver loses its signal.</span></p>
        <div class="mini"><span class="l-hr l-w">12:04:00  4840d6 <span class="g">vidljiv</span>
12:04:30  4840d6 <span class="x">nema ga</span> → zadrži
12:05:00  4840d6 <span class="g">opet tu</span></span><span class="l-en l-w">12:04:00  4840d6 <span class="g">visible</span>
12:04:30  4840d6 <span class="x">missing</span> → keep
12:05:00  4840d6 <span class="g">back again</span></span></div>
      </div>
      <div class="card">
        <div class="tag" style="--c: var(--data)"><span class="l-hr l-w">predikcija</span><span class="l-en l-w">prediction</span></div>
        <h3><span class="l-hr l-w">Kamo će avion u sljedećih 5 minuta</span><span class="l-en l-w">Where the aircraft goes in the next 5 minutes</span></h3>
        <p class="muted"><span class="l-hr l-w">Plan leta nije dostupan, pa LunaPic računa iz trenutne brzine, smjera i visine, a uzima u obzir i penjanje ili spuštanje. Traži trenutak poravnanja s Mjesecom do 5 minuta unaprijed, dok na karti crta kratku putanju za sljedećih 90 s.</span><span class="l-en l-w">No flight plan is available, so LunaPic works from current speed, direction and altitude, and also takes climb or descent into account. It looks for the moment of alignment with the Moon up to 5 minutes ahead, while the map shows a short path for the next 90 s.</span></p>
        <div class="mini"><span class="l-hr l-w">231 m/s × 90 s = <span class="a">20,8 km</span> naprijed
smjer 137° · visina 11 278 m</span><span class="l-en l-w">231 m/s × 90 s = <span class="a">20.8 km</span> ahead
track 137° · altitude 11,278 m</span></div>
      </div>
      <div class="card">
        <div class="tag" style="--c: var(--ok)"><span class="l-hr l-w">geometrija</span><span class="l-en l-w">geometry</span></div>
        <h3><span class="l-hr l-w">Pogađa li Mjesec?</span><span class="l-en l-w">Does it hit the Moon?</span></h3>
        <p class="muted"><span class="l-hr l-w">Za svaki trenutak putanje izračuna se gdje biste avion vidjeli na nebu, i to se usporedi s Mjesecom. Bitan je <strong>Elevation Miss (Δalt)</strong>: 0° znači prolaz točno kroz sredinu diska, a 0,5° je već rub.</span><span class="l-en l-w">For every moment along the path, LunaPic works out where you would see the aircraft in the sky and compares that with the Moon. The key value is the <strong>Elevation Miss (Δalt)</strong>: 0° means a pass straight through the middle of the disc, 0.5° is already the edge.</span></p>
        <div class="mini"><span class="l-hr l-w">Mjesec    az 128.4°  vis 34.1°
4840d6    az 128.4°  vis 34.0°
Δalt      <span class="g">0.1° → kroz sredinu</span></span><span class="l-en l-w">Moon      az 128.4°  alt 34.1°
4840d6    az 128.4°  alt 34.0°
Δalt      <span class="g">0.1° → through the centre</span></span></div>
      </div>
      <div class="card">
        <div class="tag" style="--c: var(--ok)"><span class="l-hr l-w">fotograf</span><span class="l-en l-w">photographer</span></div>
        <h3><span class="l-hr l-w">Koliko će biti velik</span><span class="l-en l-w">How big it will look</span></h3>
        <p class="muted"><span class="l-hr l-w">Iz udaljenosti, raspona krila, objektiva i senzora LunaPic izračuna koliki je avion u odnosu na Mjesec i koliko piksela Mjesec zauzima u kadru. Na 600 mm s full frame senzorom ima smisla do ~80 km.</span><span class="l-en l-w">From distance, wingspan, lens and sensor, LunaPic works out how big the aircraft is relative to the Moon and how many pixels the Moon fills in the frame. With 600 mm on a full-frame sensor, it is worth it up to ~80 km.</span></p>
        <div class="mini"><span class="l-hr l-w">600 mm · full frame · 6000 px
Mjesec   ≈ <span class="a">948 px</span>
avion    ≈ <span class="g">12 % Mjeseca</span></span><span class="l-en l-w">600 mm · full frame · 6000 px
Moon     ≈ <span class="a">948 px</span>
aircraft ≈ <span class="g">12 % of the Moon</span></span></div>
      </div>
    </div>
    <p class="muted" style="font-size:0.95rem; max-width: 70ch"><span class="l-hr l-w">Kandidati, upozorenja i oznake na karti uvijek uspoređuju stvarne avione sa stvarnim Mjesecom u ovom trenutku, pa pomicanje vremenske crte ne može izmisliti tranzit ni utišati pravi. Avioni koji se penju ili spuštaju ostaju u In frame sve do oko 2 minute prije poravnanja, jer im se visina ne može pouzdano predvidjeti dalje od toga.</span><span class="l-en l-w">Candidates, alerts and map marks always compare real aircraft with the real Moon right now, so moving the time line can neither invent a transit nor silence a real one. Climbing or descending aircraft stay in In frame until about 2 minutes before alignment, because their height cannot be predicted reliably further ahead.</span></p>
  </section>
  <section class="ch" id="rute" style="--c: var(--radio)">
    <div class="ch-head">
      <div class="ch-num">07</div>
      <div class="tag"><span class="l-hr l-w">Baza i rute</span><span class="l-en l-w">Database and routes</span></div>
      <h2><span class="l-hr l-w">Što baza može, a što ne može</span><span class="l-en l-w">What the database can and cannot do</span></h2>
    </div>
    <div class="split">
      <div class="prose">
        <p><span class="l-hr l-w">Javni API-ji pokazuju samo <em>sada</em>, a planovi letova nisu lako dostupni. Zato server sprema svaki let koji ulovi prijamnik: adresu, pozivni znak, položaj, visinu, brzinu, smjer, tip aviona i vrijeme.</span><span class="l-en l-w">Public APIs only show <em>now</em>, and flight plans are not easy to get. So the server stores every flight the receiver picks up: address, callsign, position, altitude, speed, direction, aircraft type and time.</span></p>
        <p><span class="l-hr l-w">Iz toga LunaPic crta <strong>gustoću prometa</strong> (heatmap) i <strong>linije preleta</strong> za zadnjih 7 dana, a stranica <strong>Flight log</strong> prikazuje tablicu letova i njihove putanje na karti. Vide se uobičajeni koridori, ali ne i točan trenutak sutrašnjeg leta.</span><span class="l-en l-w">From this LunaPic draws <strong>traffic density</strong> (heatmap) and <strong>flight tracks</strong> for the last 7 days, and the <strong>Flight log</strong> page shows a table of flights with their tracks on a map. The usual corridors are visible, but not the exact moment of tomorrow's flight.</span></p>
        <p><span class="l-hr l-w">Prognoze tranzita po redu letenja su isprobane i uklonjene, jer letovi se ne ponavljaju dovoljno točno: od 454 testirana mjesta na 84 dana podataka samo bi 2 uspjela. Zato LunaPic upozorava na stvarne avione do 5 minuta unaprijed. Za planiranje je ostao panel <strong>Runway planning</strong>: za zagrebačku zračnu luku pokazuje gdje stati da avion na prilazu stazi 04 ili pri odlasku sa staze 22 prijeđe Mjesec u odabrano vrijeme, a iz nedavnog prometa čita koja je staza trenutno u upotrebi.</span><span class="l-en l-w">Transit forecasts based on schedules were tried and removed, because flights do not repeat closely enough: of 454 spots tested on 84 days of data, only 2 would have worked. So LunaPic warns about real aircraft up to 5 minutes ahead. For planning there is the <strong>Runway planning</strong> panel: for Zagreb airport it shows where to stand so an aircraft on final to runway 04 or climbing out from runway 22 crosses the Moon at a chosen time, and it reads which runway is in use from recent traffic.</span></p>
      </div>
      <div class="card">
        <div class="tag" style="--c: var(--radio)"><span class="l-hr l-w">Linije preleta iz baze (ilustracija)</span><span class="l-en l-w">Flight tracks from the database (illustration)</span></div>
        <svg viewBox="0 0 320 200" width="100%" role="img" aria-label="Više tankih linija pojedinačnih preleta; gdje se preklapaju, nastaje koridor">
          <g fill="none" stroke-linecap="round">
            <path d="M10 170 C 90 140, 170 90, 310 30" stroke="var(--radio)" stroke-width="1.4" opacity=".45"></path>
            <path d="M10 160 C 100 135, 180 95, 310 40" stroke="var(--radio)" stroke-width="1.4" opacity=".45"></path>
            <path d="M10 180 C 80 150, 160 80, 310 25" stroke="var(--radio)" stroke-width="1.4" opacity=".45"></path>
            <path d="M10 165 C 95 150, 175 100, 310 45" stroke="var(--radio)" stroke-width="1.4" opacity=".45"></path>
            <path d="M10 175 C 85 135, 165 85, 310 32" stroke="var(--radio)" stroke-width="1.4" opacity=".45"></path>
            <path d="M10 172 C 92 141, 168 92, 310 36" stroke="var(--radio)" stroke-width="1.4" opacity=".45"></path>
            <path d="M30 20 C 120 60, 200 120, 300 190" stroke="#7aa7ff" stroke-width="1.4" opacity=".45"></path>
            <path d="M25 30 C 115 65, 205 125, 295 195" stroke="#7aa7ff" stroke-width="1.4" opacity=".45"></path>
          </g>
          <circle cx="160" cy="105" r="5" fill="var(--data)"></circle>
          <text x="170" y="122" font-family="JetBrains Mono, monospace" font-size="11" fill="var(--data)"><tspan class="l-hr">vi</tspan><tspan class="l-en">you</tspan></text>
          <text x="18" y="192" font-family="JetBrains Mono, monospace" font-size="11" fill="var(--muted)">ZAG</text>
          <text x="262" y="20" font-family="JetBrains Mono, monospace" font-size="11" fill="var(--muted)">FRA</text>
        </svg>
        <p class="muted" style="font-size:0.88rem"><span class="l-hr l-w">Svaka tanka linija je jedan zapisani prelet. Gdje se mnogo linija preklapa, nastaje koridor kojim avioni redovito lete. Boja odgovara visini.</span><span class="l-en l-w">Each thin line is one recorded pass. Where many lines overlap, a corridor appears that aircraft fly regularly. The colour shows altitude.</span></p>
      </div>
    </div>
  </section>
  <section class="ch" id="kasnjenje" style="--c: var(--warn)">
    <div class="ch-head">
      <div class="ch-num">08</div>
      <div class="tag"><span class="l-hr l-w">Kašnjenje</span><span class="l-en l-w">Delay</span></div>
      <h2><span class="l-hr l-w">Zašto je točkica ponekad iza aviona</span><span class="l-en l-w">Why the dot sometimes trails the aircraft</span></h2>
    </div>
    <div class="split">
      <div class="prose">
        <p><span class="l-hr l-w">Radio val stigne do antene gotovo trenutno. Nakon toga podatak čeka: da ga uređaj pošalje, da ga server primi i da ga aplikacija zatraži. Kod vlastitog prijamnika to je nekoliko sekundi. Javne mreže dodaju svoju obradu i duži razmak između upita, do 30 sekundi.</span><span class="l-en l-w">The radio wave reaches the antenna almost instantly. After that the data waits: for the device to send it, for the server to receive it and for the app to request it. With the own receiver that is a few seconds. Public networks add their own processing and a longer gap between requests, up to 30 seconds.</span></p>
        <p><span class="l-hr l-w">Svaki podatak nosi vrijeme kad je avion zadnji put viđen. LunaPic iz toga, brzine i smjera pomakne avion naprijed do trenutnog vremena, pa je točkica na karti puno bliže stvarnom položaju nego što bi bila bez toga. Za fino poravnanje na terenu postoji i ručna korekcija kašnjenja.</span><span class="l-en l-w">Every data point carries the time the aircraft was last seen. From that, its speed and direction, LunaPic moves the aircraft forward to the current time, so the dot on the map is much closer to the real position than it would otherwise be. For fine alignment in the field there is also a manual delay correction.</span></p>
      </div>
      <div class="card lat">
        <div class="tag" style="--c: var(--warn)"><span class="l-hr l-w">Gdje podatak čeka (najgori slučaj)</span><span class="l-en l-w">Where the data waits (worst case)</span></div>
        <div class="lat-row"><span class="muted" style="font-size:0.85rem"><span class="l-hr l-w">vlastiti prijamnik</span><span class="l-en l-w">own receiver</span></span>
          <div class="latbar" aria-hidden="true">
            <div style="flex: 5; --c: #f0b45c"><span class="l-hr l-w">slanje</span><span class="l-en l-w">sending</span></div>
            <div style="flex: 5; --c: var(--ok)">app</div>
            <div style="flex: 30; --c: transparent"></div>
          </div>
        </div>
        <div class="lat-row"><span class="muted" style="font-size:0.85rem"><span class="l-hr l-w">javne mreže</span><span class="l-en l-w">public networks</span></span>
          <div class="latbar" aria-hidden="true">
            <div style="flex: 6; --c: var(--data)"><span class="l-hr l-w">mreža</span><span class="l-en l-w">network</span></div>
            <div style="flex: 30; --c: #7aa7ff">app 0–30 s</div>
            <div style="flex: 4; --c: transparent"></div>
          </div>
        </div>
        <p class="muted" style="font-size:0.85rem"><span class="l-hr l-w">U prosjeku podatak čeka otprilike pola tih vremena. Zato je vlastiti prijamnik zadani izvor, a javne mreže samo rezerva.</span><span class="l-en l-w">On average the data waits about half those times. That is why the own receiver is the default source and public networks are only a backup.</span></p>
        <div class="slider">
          <label for="lag" class="muted" style="font-size:0.9rem"><span class="l-hr l-w">Starost podatka</span><span class="l-en l-w">Age of the data</span></label>
          <input type="range" id="lag" min="0" max="30" value="8" step="1">
          <output id="lagout" for="lag"></output>
        </div>
        <p class="muted" id="lagtxt" style="font-size:0.92rem"></p>
      </div>
    </div>
  </section>
  <section class="ch" id="karta" style="--c: var(--ok)">
    <div class="ch-head">
      <div class="ch-num">09</div>
      <div class="tag"><span class="l-hr l-w">Na karti</span><span class="l-en l-w">On the map</span></div>
      <h2><span class="l-hr l-w">Što na kraju vidite</span><span class="l-en l-w">What you end up seeing</span></h2>
    </div>
    <div class="split">
      <div class="stage3d map3d" id="map3d" role="img" aria-label="3D prikaz karte: promatrač, linija pogleda prema Mjesecu, zelena zona, krug od 80 km i avioni po visini; zeleni avion prolazi kroz liniju pogleda">
        <div class="labels"></div>
        <div class="ctrls" role="group" aria-label="Pogled">
          <button type="button" id="m-3d" aria-pressed="true"><span class="l-hr l-w">3D pogled</span><span class="l-en l-w">3D view</span></button>
          <button type="button" id="m-top" aria-pressed="false"><span class="l-hr l-w">Odozgo</span><span class="l-en l-w">Top view</span></button>
        </div>
        <div class="hint"><span class="l-hr l-w">Povucite za okretanje</span><span class="l-en l-w">Drag to rotate</span></div>
        <p class="nogl-msg"><span class="l-hr l-w">Ovaj preglednik ne podržava 3D prikaz.</span><span class="l-en l-w">This browser does not support 3D graphics.</span></p>
      </div>
      <div class="prose">
        <p><span class="l-hr l-w">Prvo provjerite je li vas GPS dobro smjestio. Ako nije, odvucite fotić na točnu lokaciju. Kad malo odzumirate, vidi se sve što treba za lov:</span><span class="l-en l-w">First check that GPS has placed you correctly. If not, drag the camera icon to the right spot. Zoom out a little and you can see everything you need for the hunt:</span></p>
        <div class="legend-list">
          <div><span class="l-hr l-w"><i style="--c: var(--moon)"></i>Linija prema Mjesecu: smjer u kojem je Mjesec sada</span><span class="l-en l-w"><i style="--c: var(--moon)"></i>Line to the Moon: the direction of the Moon right now</span></div>
          <div><span class="l-hr l-w"><i class="dash" style="--c: var(--moon)"></i>Put Mjeseca: od izlaska do zalaska</span><span class="l-en l-w"><i class="dash" style="--c: var(--moon)"></i>Moon path: from moonrise to moonset</span></div>
          <div><span class="l-hr l-w"><i class="dash" style="--c: var(--data)"></i>Krug od 80 km: dokle se avion na 600 mm još može lijepo snimiti</span><span class="l-en l-w"><i class="dash" style="--c: var(--data)"></i>80 km circle: how far an aircraft can still be photographed well at 600 mm</span></div>
          <div><span class="l-hr l-w"><i class="pt" style="--c: var(--ok)"></i>Zelena zona i zeleni avion: kandidat za tranzit</span><span class="l-en l-w"><i class="pt" style="--c: var(--ok)"></i>Green zone and green aircraft: transit candidate</span></div>
          <div><span class="l-hr l-w"><i class="dash" style="--c: var(--ok)"></i>Crta ispred aviona: predikcija putanje za 90 s</span><span class="l-en l-w"><i class="dash" style="--c: var(--ok)"></i>Line ahead of the aircraft: predicted path for 90 s</span></div>
        </div>
        <div class="alt-scale">
          <div class="bar"></div>
          <div class="ticks"><span class="l-hr l-w"><span>nisko</span><span>visoko</span></span><span class="l-en l-w"><span>low</span><span>high</span></span></div>
          <small class="muted"><span class="l-hr l-w">Boja i veličina pokazuju visinu: što je avion manji, to leti više. Na skali visine (Altitude) može se filtrirati.</span><span class="l-en l-w">Colour and size show altitude: the smaller the aircraft, the higher it flies. You can filter on the altitude scale.</span></small>
        </div>
      </div>
    </div>
    <div class="card next-card">
      <h3><span class="l-hr">Ploča Next transit</span><span class="l-en">The Next transit board</span></h3>
      <p class="muted l-hr">Karta je preko cijelog zaslona, a ploča <strong>Next transit</strong> bez otvaranja ijednog panela odgovara na tri pitanja: kada, koji avion i jeste li na liniji. Prikazuje odbrojavanje („Moon crossing in”), udaljenost, pokrivenost diska, ocjenu snimke i ostale kandidate. Kad nema ničega, pokazuje visinu, smjer i osvijetljenost Mjeseca.</p>
      <p class="muted l-en">The map fills the screen, and the <strong>Next transit</strong> board answers three questions without opening any panel: when, which aircraft and whether you are on the line. It shows the countdown (“Moon crossing in”), range, disc coverage, shot rating and other candidates. With nothing to show, it gives the Moon's altitude, azimuth and illumination.</p>
    </div>
    <div class="cards">
      <div class="card"><h3><span class="l-hr l-w">Slojevi karte</span><span class="l-en l-w">Map layers</span></h3><p><span class="l-hr l-w"><strong>3D Model</strong>, <strong>2D Flat</strong>, <strong>ATC Style</strong> (kao ekran kontrole leta, radi najglađe), <strong>VFR Map</strong> i <strong>Street</strong>, koji na uličnoj fotografiji pokazuje gdje je Mjesec. U istom izborniku je i povijest letova: heatmap i linije preleta za 7 dana.</span><span class="l-en l-w"><strong>3D Model</strong>, <strong>2D Flat</strong>, <strong>ATC Style</strong> (like an air traffic control screen, the smoothest), <strong>VFR Map</strong> and <strong>Street</strong>, which shows where the Moon is on a street-level photo. The same menu holds flight history: a heatmap and flight tracks for 7 days.</span></p></div>
      <div class="card"><h3><span class="l-hr l-w">Tranziti i obavijesti</span><span class="l-en l-w">Transits and alerts</span></h3><p><span class="l-hr l-w"><strong>Active transits</strong> prikazuje prelete koji se upravo događaju, a <strong>Transit candidates</strong> one koji bi mogli proći preko Mjeseca. Zvonce uključuje zvuk i push obavijesti, koje stižu i kad je aplikacija zatvorena.</span><span class="l-en l-w"><strong>Active transits</strong> shows passes happening right now, and <strong>Transit candidates</strong> shows those that might cross the Moon. The bell turns on sound and push notifications, which arrive even when the app is closed.</span></p></div>
      <div class="card"><h3>Photographer</h3><p><span class="l-hr l-w">Odaberete aparat i objektiv, a LunaPic pokaže Mjesec u točnoj fazi, smjer iz kojeg dolazi avion i njegovu veličinu u kadru. Disk se crta na uređaju iz NASA-ine fotografije, pa ne treba internet.</span><span class="l-en l-w">Pick your camera and lens, and LunaPic shows the Moon in its exact phase, the direction the aircraft comes from and its size in the frame. The disc is drawn on your device from a NASA photo, so no internet is needed.</span></p></div>
      <div class="card"><h3><span class="l-hr l-w">Na terenu</span><span class="l-en l-w">In the field</span></h3><p><span class="l-hr l-w"><strong>Moon (nowcast)</strong> govori je li Mjesec dovoljno visoko. <strong>Field overlays</strong> otvara AR prikaz neba kroz kameru mobitela i sadrži zaključavanje lokacije. Tu su i <strong>Compass → Moon</strong>, <strong>Observer</strong>, <strong>Flight source</strong> i <strong>Flight filters</strong>.</span><span class="l-en l-w"><strong>Moon (nowcast)</strong> tells you whether the Moon is high enough. <strong>Field overlays</strong> opens the AR sky view through your phone camera and holds the location lock. There are also <strong>Compass → Moon</strong>, <strong>Observer</strong>, <strong>Flight source</strong> and <strong>Flight filters</strong>.</span></p></div>
    </div>
  </section>
  <section class="ch" id="pitanja" style="--c: var(--data)">
    <div class="ch-head">
      <div class="ch-num">?</div>
      <div class="tag"><span class="l-hr l-w">Česta pitanja</span><span class="l-en l-w">Frequently asked questions</span></div>
      <h2><span class="l-hr l-w">Ono što ljudi obično pitaju</span><span class="l-en l-w">What people usually ask</span></h2>
    </div>
    <div>
      <details><summary><span class="l-hr l-w">Zašto Flightradar24 pokazuje avion koji LunaPic nema?</span><span class="l-en l-w">Why does Flightradar24 show an aircraft LunaPic does not?</span></summary><p><span class="l-hr l-w">Svaka mreža ima svoje antene i svoje partnere. LunaPic zadano prikazuje samo ono što čuje vlastiti prijamnik, a dodatne avione donose OpenSky i adsb.lol ako ih uključite. Vrijedi i obrnuto: LunaPic ponekad vidi ono što drugi nemaju.</span><span class="l-en l-w">Every network has its own antennas and partners. By default LunaPic shows only what its own receiver hears, and OpenSky and adsb.lol add more aircraft if you turn them on. The reverse is also true: LunaPic sometimes sees what others do not.</span></p></details>
      <details><summary><span class="l-hr l-w">Zašto javne mreže nisu uključene zadano?</span><span class="l-en l-w">Why are public networks not on by default?</span></summary><p><span class="l-hr l-w">Njihove pozicije kasne do 30 sekundi, a to bi pokvarilo odbrojavanje do tranzita. Vlastiti prijamnik je brži i nema dnevno ograničenje upita. Javne mreže uključite ako snimate daleko od Zagreba ili ako prijamnik ne radi.</span><span class="l-en l-w">Their positions lag by up to 30 seconds, which would spoil the countdown to a transit. The own receiver is faster and has no daily request limit. Turn on public networks if you shoot far from Zagreb or if the receiver is down.</span></p></details>
      <details><summary><span class="l-hr l-w">Što znači „offline” ili „rate limited” uz izvor?</span><span class="l-en l-w">What do “offline” or “rate limited” next to a source mean?</span></summary><p><span class="l-hr l-w">„Offline” znači da vlastiti prijamnik neko vrijeme nije poslao nove podatke. Karta tada ostaje prazna dok ne uključite javni izvor, a nakon 5 minuta pretplatnici dobiju obavijest. „Rate limited” znači da je javna mreža privremeno ograničila upite. „Unavailable” je bilo koji drugi kvar javne mreže.</span><span class="l-en l-w">“Offline” means the own receiver has not sent new data for a while. The map then stays empty until you turn on a public source, and after 5 minutes subscribers get a notification. “Rate limited” means a public network has temporarily limited requests. “Unavailable” is any other public network failure.</span></p></details>
      <details><summary><span class="l-hr">Može li LunaPic predvidjeti tranzit za sutra?</span><span class="l-en">Can LunaPic predict tomorrow's transit?</span></summary><p class="l-hr">Ne. Letovi se ne ponavljaju dovoljno točno, a Mjesec je širok samo pola stupnja. Aplikacija upozorava na stvarne avione do 5 minuta unaprijed. Za unaprijed je tu Runway planning, koji za zagrebačku zračnu luku pokazuje gdje stati za odabrano vrijeme.</p><p class="l-en">No. Flights do not repeat closely enough, and the Moon is only half a degree wide. The app warns about real aircraft up to 5 minutes ahead. For planning ahead there is Runway planning, which shows where to stand at Zagreb airport for a chosen time.</p></details>
      <details><summary><span class="l-hr l-w">Je li legalno slušati te signale?</span><span class="l-en l-w">Is it legal to listen to these signals?</span></summary><p><span class="l-hr l-w">U Hrvatskoj i većini Europe primanje ADS-B signala je dopušteno. Signal je namjerno javan, da bi ga mogli čuti i drugi avioni.</span><span class="l-en l-w">In Croatia and most of Europe, receiving ADS-B signals is allowed. The signal is public on purpose, so other aircraft can hear it too.</span></p></details>
      <details><summary><span class="l-hr l-w">Rade li obavijesti na iPhoneu?</span><span class="l-en l-w">Do notifications work on iPhone?</span></summary><p><span class="l-hr l-w">Rade ako je LunaPic dodan na početni zaslon (iOS 16.4 ili noviji). Tada iOS koristi svoj sistemski zvuk obavijesti.</span><span class="l-en l-w">Yes, if LunaPic is added to the Home Screen (iOS 16.4 or later). iOS then uses its own system notification sound.</span></p></details>
      <details><summary><span class="l-hr l-w">Što sve treba za vlastitu ADS-B stanicu?</span><span class="l-en l-w">What do I need for my own ADS-B station?</span></summary><p><span class="l-hr l-w">Raspberry Pi (dovoljan je model 3), SD karticu, RTL-SDR USB prijamnik za 1090 MHz, antenu i internet. Na Pi ide Raspberry Pi OS Lite i softver za dekodiranje. Kad u tar1090 vidite avione oko sebe, stanica radi. Što je antena više i što je pogled otvoreniji, to je domet veći.</span><span class="l-en l-w">A Raspberry Pi (a model 3 is enough), an SD card, an RTL-SDR USB receiver for 1090 MHz, an antenna and internet. Install Raspberry Pi OS Lite and decoding software. When you see aircraft around you in tar1090, the station works. The higher the antenna and the more open the view, the longer the range.</span></p></details>
    </div>
  </section>
  <footer>
    <span><span class="l-hr l-w">Objašnjenje za aplikaciju LunaPic</span><span class="l-en l-w">An explainer for the LunaPic app</span></span>
    <span><span class="l-hr l-w">Podaci o letovima: LunaPic ADS-B · OpenSky Network · adsb.lol. Primjeri brojeva su ilustrativni.</span><span class="l-en l-w">Flight data: LunaPic ADS-B · OpenSky Network · adsb.lol. Example figures are illustrative.</span></span>
  </footer>
</div>`;

export const ABOUT_FAQ: { question: string; answer: string }[] = [
  {
    "question": "Why does Flightradar24 show an aircraft LunaPic does not?",
    "answer": "Every network has its own antennas and partners. By default LunaPic shows only what its own receiver hears, and OpenSky and adsb.lol add more aircraft if you turn them on. The reverse is also true: LunaPic sometimes sees what others do not."
  },
  {
    "question": "Why are public networks not on by default?",
    "answer": "Their positions lag by up to 30 seconds, which would spoil the countdown to a transit. The own receiver is faster and has no daily request limit. Turn on public networks if you shoot far from Zagreb or if the receiver is down."
  },
  {
    "question": "What do “offline” or “rate limited” next to a source mean?",
    "answer": "“Offline” means the own receiver has not sent new data for a while. The map then stays empty until you turn on a public source, and after 5 minutes subscribers get a notification. “Rate limited” means a public network has temporarily limited requests. “Unavailable” is any other public network failure."
  },
  {
    "question": "Can LunaPic predict tomorrow's transit?",
    "answer": "No. Flights do not repeat closely enough, and the Moon is only half a degree wide. The app warns about real aircraft up to 5 minutes ahead. For planning ahead there is Runway planning, which shows where to stand at Zagreb airport for a chosen time."
  },
  {
    "question": "Is it legal to listen to these signals?",
    "answer": "In Croatia and most of Europe, receiving ADS-B signals is allowed. The signal is public on purpose, so other aircraft can hear it too."
  },
  {
    "question": "Do notifications work on iPhone?",
    "answer": "Yes, if LunaPic is added to the Home Screen (iOS 16.4 or later). iOS then uses its own system notification sound."
  },
  {
    "question": "What do I need for my own ADS-B station?",
    "answer": "A Raspberry Pi (a model 3 is enough), an SD card, an RTL-SDR USB receiver for 1090 MHz, an antenna and internet. Install Raspberry Pi OS Lite and decoding software. When you see aircraft around you in tar1090, the station works. The higher the antenna and the more open the view, the longer the range."
  }
];
