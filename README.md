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

- paikalla olevien hahmojen määrä chat-kentässä
- GIF-estot
- huoneen kirkkaus- ja yövalosäädöt
- ilmoituskuplien ja tapahtumakutsujen käsittely
- chat-historian välimuisti
- ääniviestit
- LiveKit- ja etusivupainikkeet
- FastLoad- ja renderer-config-asetukset
- pakettien loki, pakettirakentaja ja makrot

Pakettityökalut voivat tarkkailla, muokata ja lähettää peliclientin WebSocket-paketteja. Käytä niitä omalla vastuulla ja Kuplahotellin sääntöjen mukaisesti.

## v2.1.5

- korjattu bookmarkletin käynnistys: Nitro-client käynnistyy uudelleen vasta, kun KuplaFix on valmis
- säilyttää Nitro-URL:n SSO-parametreineen
- säilyttää turvallisen iframe-uudelleenkäynnistyksen ilman lupausta ensimmäisen WebSocket-yhteyden koukkaamisesta
- sitoo iframeen kuuluvat ominaisuudet uudelleen clientin käynnistyessä
- avaa chat-historian erilliseen ikkunaan samalla ulkoasulla ja samoilla suodatusasetuksilla ilman Nitro-clientin DOMin siirtämistä
- lisää raw GitHub -päivitys- ja latausosoitteet ScriptCatille
- estää kaksoisalustuksen ja lisää hyödylliset käynnistyslokit
- säilyttää vanhat asetukset, makrot ja välimuistin

## Päivitykset

ScriptCat seuraa tämän repositorion raw `kuplafix.user.js` -tiedostoa automaattisesti. Uusimmat muutokset ja julkaisut ovat GitHub-repositoriossa.

## Lisätietoa

- Bookmarkletin tekninen käynnistysjakso: [docs/BOOKMARKLET_LIFECYCLE.md](docs/BOOKMARKLET_LIFECYCLE.md)
- Repositoriojulkasun ohje: [docs/RELEASE.md](docs/RELEASE.md)
