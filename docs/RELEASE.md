# KuplaFix-julkaisu 2.2.1

KuplaFix julkaistaan suoraan GitHub-repositoriosta. ScriptCat ja muut userscript-hallinnat käyttävät automaattiseen päivitykseen tätä osoitetta:

<https://raw.githubusercontent.com/0-es/kuplafix/main/kuplafix.user.js>

Bookmarkletin julkinen asennussivu on:

<https://0-es.github.io/kuplafix/>

## Julkaisun tarkistus

1. Varmista, että userscriptin `@version` ja `SCRIPT_VERSION` ovat `2.2.1` ja että `@updateURL` sekä `@downloadURL` osoittavat raw-tiedostoon.
2. Varmista, että `index.html` näyttää version `2.2.1` ja bookmarklet lataa `kuplafix.user.js?v=2.2.1`.
3. Tarkista JavaScriptin syntaksi komennolla `node --check kuplafix.user.js`.
4. Aja `tests/browser-smoke.html` paikallisen HTTP-palvelimen kautta ja varmista, että kaikki 26 tarkistusta läpäisevät.
5. Tarkista `git diff --check` ja varmista, ettei julkaisu sisällä tunnuksia, SSO-lippuja tai muita salaisuuksia.
6. Pushin jälkeen varmista raw-osoitteesta, että metadata näyttää version `2.2.1`.
7. Varmista GitHub Pages -sivulta, että sama versio näkyy ja bookmarkletin cache-avain on päivittynyt.
8. Asenna userscript raw-osoitteesta ScriptCatiin ja varmista, että päivitystarkistus löytää version 2.2.1.
