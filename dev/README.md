# Paikallinen bookmarklet-testaus

Tämän avulla `kuplafix.user.js` ja bookmarklet-lataaja voidaan testata ilman GitHub-pushia.

1. Aja kerran PowerShellissä: `./dev/setup-local-https.ps1`.
   Se luo vain nykyiselle Windows-käyttäjälle luotetun paikallisen kehityssertifikaatin. Sertifikaatit jäävät `dev/certs/`-hakemistoon eikä niitä versionhallita.
2. Käynnistä palvelin repositorion juuressa: `node dev/serve-local.mjs`.
3. Avaa `https://localhost:8443/dev/index.local.html` ja vedä **KuplaFix LOCAL** kirjanmerkkipalkkiin.
4. Muokkaa `kuplafix.user.js` tai paikallista bookmarklet-sivua ja paina kirjanmerkkiä uudelleen Kuplahotelli-sivulla. Palvelin lähettää JavaScriptin ilman välimuistia.

Paikallinen bookmarklet käyttää `https://localhost:8443/kuplafix.user.js?dev=<aikaleima>`. Tuotantobookmarklet pysyy GitHub Pages -osoitteessa.
