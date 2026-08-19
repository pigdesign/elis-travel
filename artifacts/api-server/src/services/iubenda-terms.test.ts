import test from "node:test";
import assert from "node:assert/strict";
import { extractTermsVersion } from "./iubenda-terms";

test("legge la data di ultima modifica dal documento Iubenda", () => {
  // Frammento nella forma reale restituita dall'endpoint pubblico.
  const html = `
    <div id="iubenda_policy" class="iubenda_terms_policy">
      <div class="iub_content">
        <h1>Termini e Condizioni di elis-travel.it</h1>
        <p>Autorizzazione all'addebito differito tramite carta di pagamento</p>
        <p class="iub_footer">Ultima modifica: 19 agosto 2026
        </p>
      </div>
    </div>`;
  assert.equal(extractTermsVersion(html), "19 agosto 2026");
});

test("restituisce null se la data non c'e", () => {
  assert.equal(extractTermsVersion("<div>Termini senza data</div>"), null);
  assert.equal(extractTermsVersion(""), null);
});

test("non confonde una riga vuota con una versione", () => {
  assert.equal(extractTermsVersion("Ultima modifica:   \n resto"), null);
});
