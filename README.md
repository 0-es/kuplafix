# kuplafix

> kuplahotelli UI fixes & enhancements (ScriptCat edition)

KuplaFix lisää Kuplahotellin peliclienttiin käytännöllisiä korjauksia, asetuksia ja pakettityökaluja. Asetukset tallentuvat automaattisesti.

## Asennus

### ScriptCat / userscript

Suositeltu tapa on asentaa KuplaFix userscriptinä ScriptCatilla tai muulla userscript-hallinnalla:

<https://raw.githubusercontent.com/0-es/kuplafix/main/kuplafix.user.js>

Script käynnistyy tällöin automaattisesti, kun avaat Kuplahotellin peliclientin.

### Bookmarklet

1. Avaa <https://0-es.github.io/kuplafix/>.
2. Vedä **KuplaFix**-painike kirjanmerkkipalkkiin.
3. Avaa Kuplahotelli, kirjaudu sisään ja avaa peliclientti.
4. Paina kirjanmerkkipalkin KuplaFix-painiketta.

Bookmarklet käynnistää vain peliclientin Nitro-iframeen uudelleen, ei koko sivua. Se ei voi taata uuden clientin ensimmäisen WebSocket-yhteyden koukkausta: siihen tarvitaan erillinen userscript-laajennuksen client-iframeen `document-start`-vaiheessa ajama hook.

Jos bookmarklet-lataaja päivittyy, poista vanha kirjanmerkki ja vedä uusi painike asennussivulta.

## Käyttö

KuplaFix-painike ilmestyy Nitro-clientin sivupalkkiin tai työkaluriviin. Avaa siitä KuplaFix-valikko ja ota haluamasi ominaisuudet käyttöön. Kaikki asetukset tallentuvat automaattisesti.

## Ominaisuudet

- kirjautumisen yhteenvetokortti: viime käynti, aktiiviset huoneet, kavereiden nykyinen sijainti, edellisen session viestit ja paikalla oleva henkilökunta
- paikalla olevien hahmojen määrä chat-kentässä
- GIF-estot
- huoneen kirkkaus- ja yövalosäädöt
- ilmoituskuplien ja tapahtumakutsujen käsittely
- chat-historian välimuisti
- erillinen chat-ikkuna samoilla Nitro- ja KuplaFix-tyyleillä
- Game mode: WASD-ohjaus tai WASD-pikaviestit, muut yhden merkin pikaviestit sekä väliaikainen UI- ja näppäinkytkin
- ääniviestit
- LiveKit- ja etusivupainikkeet
- renderer- ja UI-config-asetukset
- pakettien loki, pakettirakentaja, otsakekohtaiset esto-/muokkaussuodattimet ja makrot

Pakettityökalut voivat tarkkailla, muokata ja lähettää peliclientin WebSocket-paketteja. Käytä niitä omalla vastuulla ja Kuplahotellin sääntöjen mukaisesti.

## v2.2.1

### Packet Builder

- lisää pysyvän **Filters**-välilehden: sisään- ja ulosmenevän paketin voi estää otsakkeen perusteella tai rakentaa uudelleen korvaamalla valitut parserin tunnistamat argumentit; muut live-paketin argumentit säilyvät ennallaan
- tukee numero- ja nimiotsakkeita, suodatinten päälle/pois-kytkentää, osumamäärää sekä uusimman vastaavan Builder-paketin käyttämistä muokkauspohjana
- tallentaa pakettilokin asetuksen oikein ja indeksoi aktiiviset suodattimet, makrot sekä otsakenimet, jolloin jokainen paketti ei enää käy läpi kaikkia sääntöjä

### Kirjautumisen yhteenveto

- korjaa useiden kaverihuoneblobbien asettelun: kortit pakataan yhteen kolmen sarakkeen ruudukkoon ilman tyhjiä paikkoja, saman huoneen ryhmä pysyy yhtenäisenä rivinvaihdoissa ja 5 px ryhmäväli piirretään kortin sisään muuttamatta korttien kokoa
- antaa jokaiselle näkyvälle huoneryhmälle oman värin myös valmiin väripaletin täytyttyä; ilman nykyistä huonetta olevat kaverit ovat aina erillisiä neutraalin harmaita kortteja
- säilyttää vain nykyisen ja edellisen loogisen käynnin: alle tunnin sisällä tapahtuva uudelleenlataus tai yhteyden palautuminen jatkaa nykyistä käyntiä eikä korvaa edellisen käynnin aikaleimaa
- näyttää yhteenvedon automaattisesti enintään kerran yhden clienttilatauksen aikana
- poistaa kaverikorteista vanhan “viimeksi huoneessa” -tiedon; nykyisessä huoneessa olevan kaverin koko kortti korostaa vastaavan huonekortin ja vie klikattaessa huoneeseen
- korjaa huonekortin muodon `1 hahmo` / `n hahmoa` ja kupla-animaation: kuplien määrä seuraa käyttäjämäärää, aloitukset porrastuvat ilman näkyvää silmukan nollausta ja vähennetyn liikkeen selainasetus poistaa animaation
- korjaa edellisen session otteen suodatuksen niin, etteivät system-, bot- tai WIRED-viestit näy yhteenvetokortissa

### Korjaukset ja suorituskyky

- sieppaa Nitro/Reactin vaihtaman keskusteluhistoriapainikkeen dokumentin capture-vaiheessa, joten KuplaFixin historia avautuu ilman DOM-observeria, watchdog-ajastinta tai uudelleensidonnan viivettä; ominaisuuden ollessa pois käytöstä Nitron oma historia toimii normaalisti
- poistaa FastLoadin ja sen asetuksen kokonaan: tallennetuissa Chrome-suorituskykyjäljissä yhteysvihjeet ja ennakkolataus eivät nopeuttaneet WebSocket-yhteyden muodostusta
- tekee renderer/UI-config-pyynnön vain kerran, palauttaa alkuperäisen vastauksen ilman turhaa uudelleenrakennusta silloin kun ohituksia ei ole ja jättää koukun kokonaan asentamatta ominaisuuden ollessa pois käytöstä
- käynnistää GIF- ja huonevalaistus-observerit vain ominaisuuden ollessa käytössä, irrottaa ne poiskytkennässä ja rajaa ääniviestien tarkistuksen vain uusiin DOM-alipuihin
- jättää hahmomäärän verkkopyynnöt väliin taustavälilehdessä, yhdistää päällekkäiset Nitro-iframe- ja UI-painikkeiden uusintayritykset sekä lopettaa poistettujen iframe-dokumenttien seurannan
- korjaa GIF-asetuspaneelin oikeat tilat, asetusavaimet ja käyttäjänimien HTML-escapoinnin sekä tapahtumakutsun kaksiosaisen `.nitro-alert-hotel.event`-luokkavalitsimen
- päivittää userscript-metadatan version, kuvauksen ja tekijän sekä asennussivun version ja bookmarkletin välimuistiavaimen versioon 2.2.1

### Dokumentaatio ja testit

- lisää ominaisuuspohjaisen HTML-kartan KuplaFixin modeista, automaattisista korjauksista, asetuksista, verkkokutsuista, tallennuksesta ja DOM/WebSocket-kosketuspinnoista
- lisää 26 kohdan selaimen smoke-testin, joka kattaa config-ohitukset, chat-historian kaappauksen, pakettisuodattimet ja -indeksit, kaveriblobien geometrian, huonevärien erottelun, käyntiaikaleimat sekä tapahtumakutsun valitsimen

## v2.2.0

- lisää kirjautumisen jälkeen avautuvan, siirrettävän yhteenvetokortin viimeisestä tallennetusta käynnistä, aktiivisista huoneista, kavereista, henkilökunnasta ja edellisen session keskustelusta
- hakee yhdellä `:userson`-komennolla käyttäjien nimet, huoneet ja tunnisteet, tunnistaa tuotannon vastausmuodon ja sulkee komentovastauksen automaattisesti tietojen saavuttua
- näyttää aktiiviset huoneet Navigator-henkisinä kortteina natiivikokoisine huonekuvineen, `1 hahmo` / `N hahmoa` -määrineen, kavereiden avataripäineen ja käyttäjämäärään suhteutettuine, pehmeästi ajoitettuine kuplineen
- näyttää kaikki paikalla olevat kaverit terävinä head-only-avatareina huonekohtaisesti sävytetyssä, rivit täyttävässä ruudukossa; saman huoneen kortit muodostavat yhtenäisen blobin ja eri ryhmät erotetaan pienellä välillä
- siirtyy kaverin huoneeseen korttia painamalla ja korostaa vastaavan huonekortin minkä tahansa kaverikortin päällä osoitetta pidettäessä
- näyttää edellisen session keskustelun Kuplan omalla typografialla ja kuplatyyleillä, mutta jättää yhteenvedosta pois järjestelmä-, botti- ja WIRED-viestit säilyttäen ne varsinaisessa keskusteluhistoriassa
- näyttää määritellyn henkilökunnan huoneineen vain silloin, kun henkilökuntaa on paikalla
- lisää KuplaFix-valikkoon yhteenvetokortin käyttökytkimen, muokattavan henkilökuntalistan ja poissaolorajan, jonka jälkeen yhteenveto avautuu automaattisesti
- tallentaa viime käynnin tiedot käyttäjäkohtaisesti ilman kaikkien käyttäjien raakaa sijaintilistaa ja säilyttää yhteenvetoikkunan siirretyn sijainnin
- tiivistää KuplaFix-valikkoa ja käyttää valikossa sekä yhteenvetokortissa läpikuultavaa, muun KuplaFix-käyttöliittymän mukaista ulkoasua

## v2.1.6

- korjattu bookmarkletin käynnistys: Nitro-client käynnistyy uudelleen vasta, kun KuplaFix on valmis
- säilyttää Nitro-URL:n SSO-parametreineen
- säilyttää turvallisen iframe-uudelleenkäynnistyksen ilman lupausta ensimmäisen WebSocket-yhteyden koukkaamisesta
- sitoo iframeen kuuluvat ominaisuudet uudelleen clientin käynnistyessä
- avaa chat-historian erilliseen ikkunaan samalla ulkoasulla ja samoilla suodatusasetuksilla ilman Nitro-clientin DOMin siirtämistä
- kopioi Nitro-clientin chat-tyylit erilliseen historiaikkunaan
- korjaa erillisen historiaikkunan otsikon, sulkupainikkeen ja suodattimien ulkoasun
- lisää Game moden: WASD-liikkuminen tai WASD-pikaviestit ja kirjainten/numeroiden yhden merkin pikaviestit
- lisää Game modelle väliaikaisen chat-kentän yläpuolisen kytkimen ja käyttäjän määrittämän pikanäppäimen
- estää tavallisen kirjoittamisen Game moden ollessa aktiivinen ja mahdollistaa peräkkäiset pikaviestit
- tallentaa kaikki päävalikon ominaisuusasetukset automaattisesti ilman erillisiä tallennuspainikkeita
- korjaa Packet Builderin makrojen vastaanottoasetuksen tallennuksen
- uudistaa bookmarklet-sivun KuplaFix-väreillä ja selkeämmällä asennuspolulla
- lisää raw GitHub -päivitys- ja latausosoitteet ScriptCatille
- estää kaksoisalustuksen ja lisää hyödylliset käynnistyslokit
- säilyttää vanhat asetukset, makrot ja välimuistin

## Päivitykset

ScriptCat seuraa tämän repositorion raw `kuplafix.user.js` -tiedostoa automaattisesti. Uusimmat muutokset ja julkaisut ovat GitHub-repositoriossa.

## Lisätietoa

- KuplaFixin koko vaikutuspinta ja optimointien auditointi: [docs/KUPLAFIX_TOUCH_MAP.html](docs/KUPLAFIX_TOUCH_MAP.html)
- Hyllytetyn multi-room-idean tekninen selvitys ja rajoitteet: [docs/MULTI_ROOM_SPLIT_VIEW_DISCOVERY.md](docs/MULTI_ROOM_SPLIT_VIEW_DISCOVERY.md)
- Bookmarkletin tekninen käynnistysjakso: [docs/BOOKMARKLET_LIFECYCLE.md](docs/BOOKMARKLET_LIFECYCLE.md)
- Repositoriojulkasun ohje: [docs/RELEASE.md](docs/RELEASE.md)
- Selaimen regressiotarkistukset: [tests/browser-smoke.html](tests/browser-smoke.html)
