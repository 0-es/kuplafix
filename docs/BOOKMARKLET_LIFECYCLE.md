# Bookmarkletin käynnistysjakso

## Miksi vain Nitro käynnistetään uudelleen

KuplaFixin asetukset ja persistentti tila kuuluvat Kuplahotellin ulommalle sivulle. Koko sivun lataaminen uudelleen hävittäisi tämän tilan ja voi katkaista SSO-virran. Siksi bookmarklet käynnistää vain saman originin `#nitro`-iframentin sen alkuperäisellä, SSO-parametrit sisältävällä URL:lla.

## Bookmarkletin tehtävä

1. Bookmarklet tarkistaa Kuplahotelli-hostin, asettaa `window.__KUPLAFIX_BOOKMARKLET_BOOT__`-lipun ja injektoi KuplaFixin.
2. Script kuluttaa lipun, perustaa singletonin ja lataa asetukset.
3. Iframe-sidonnaiset callbackit pidetään keskeytettyinä, kunnes uusi Nitro-dokumentti on valmis.
4. Script käynnistää `#nitro`-iframentin uudelleen sen täsmällisellä `src`-osoitteella.
5. Kun uusi dokumentti on ladattu, lifecycle-callbackit sidotaan uudelleen.

`about:blank`- tai `document.write()`-bootstrapia ei käytetä. Selain ei salli `about:blank`-dokumentin History API -osoitteen vaihtamista Nitro-clientin URL:ksi, ja virhe voi muuten jättää pelin tyhjään iframeen.

## WebSocket-koukun rajoitus

Bookmarklet voi ajaa scriptin vain ulommassa sivussa. Selain ei tarjoa ulommalle sivulle luotettavaa tapaa asentaa JavaScript-patchia uuden navigoivan iframe-ikkunan realmiiin ennen kuin clientin omat skriptit alkavat suorittaa. Iframe `load` -tapahtuma on siihen liian myöhäinen.

Pakettityökalujen deterministinen toteutus vaatii erillisen, userscript-laajennuksen Nitro-clienttiin `document-start`-vaiheessa ajaman hookin. Bookmarklet on tarkoitettu UI-ominaisuuksien käynnistämiseen turvallisesti eikä väitä takaavansa ensimmäisen peliyhteyden WebSocket-koukkausta.

## Kaksoisalustus

Globaalit ohjaimet käynnistyvät kerran. `DOM` ohittaa `about:blank`-dokumentit ja välittää jokaisen oikean Nitro-dokumentin kerran iframe-sidonnaisille callbackeille. Uusi bookmarklet-painallus ei aloita toista käynnistystä, jos KuplaFix on jo latautumassa tai aktiivinen.
