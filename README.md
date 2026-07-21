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

- kirjautumisen yhteenvetokortti: viime käynti, aktiiviset huoneet, kavereiden nykyinen ja aiempi sijainti, edellisen session viestit ja paikalla oleva henkilökunta
- paikalla olevien hahmojen määrä chat-kentässä
- GIF-estot
- huoneen kirkkaus- ja yövalosäädöt
- ilmoituskuplien ja tapahtumakutsujen käsittely
- chat-historian välimuisti
- erillinen chat-ikkuna samoilla Nitro- ja KuplaFix-tyyleillä
- Game mode: WASD-ohjaus tai WASD-pikaviestit, muut yhden merkin pikaviestit sekä väliaikainen UI- ja näppäinkytkin
- ääniviestit
- LiveKit- ja etusivupainikkeet
- FastLoad- ja renderer-config-asetukset
- pakettien loki, pakettirakentaja ja makrot

Pakettityökalut voivat tarkkailla, muokata ja lähettää peliclientin WebSocket-paketteja. Käytä niitä omalla vastuulla ja Kuplahotellin sääntöjen mukaisesti.

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

- Bookmarkletin tekninen käynnistysjakso: [docs/BOOKMARKLET_LIFECYCLE.md](docs/BOOKMARKLET_LIFECYCLE.md)
- Repositoriojulkasun ohje: [docs/RELEASE.md](docs/RELEASE.md)
