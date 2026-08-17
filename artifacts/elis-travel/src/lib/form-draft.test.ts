import assert from "node:assert/strict";
import test from "node:test";
import {
  DRAFT_TTL_MS,
  describeDraftAge,
  draftStorageKey,
  pruneExpiredDrafts,
  readDraft,
  removeDraft,
  writeDraft,
} from "./form-draft";

/** localStorage finto: la stessa forma usata negli altri test del pacchetto. */
function withFakeStorage(
  run: (values: Map<string, string>) => void,
  options: { failOnSet?: boolean } = {},
): void {
  const values = new Map<string, string>();
  const storage = {
    get length() {
      return values.size;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (options.failOnSet) throw new Error("QuotaExceededError");
      values.set(key, value);
    },
    removeItem: (key: string) => values.delete(key),
  };

  const target = globalThis as unknown as {
    window?: { localStorage: unknown };
  };
  const previous = target.window;
  target.window = { localStorage: storage };
  try {
    run(values);
  } finally {
    if (previous) target.window = previous;
    else delete target.window;
  }
}

test("scrive e rilegge una bozza", () => {
  withFakeStorage(() => {
    writeDraft("excursion:create", { name: "Cinque Terre", posti: "45" });

    const draft = readDraft<{ name: string; posti: string }>(
      "excursion:create",
    );
    assert.equal(draft?.value.name, "Cinque Terre");
    assert.equal(draft?.value.posti, "45");
    assert.equal(typeof draft?.savedAt, "number");
  });
});

test("non ripropone una bozza piu' vecchia del TTL e la ripulisce", () => {
  withFakeStorage((values) => {
    values.set(
      draftStorageKey("excursion:create"),
      JSON.stringify({
        savedAt: Date.now() - (DRAFT_TTL_MS + 1000),
        value: { name: "vecchia" },
      }),
    );

    assert.equal(readDraft("excursion:create"), null);
    assert.equal(values.has(draftStorageKey("excursion:create")), false);
  });
});

test("ignora una bozza corrotta senza far esplodere il form", () => {
  withFakeStorage((values) => {
    values.set(draftStorageKey("excursion:create"), "{ non json");
    assert.equal(readDraft("excursion:create"), null);

    values.set(draftStorageKey("offer:create"), JSON.stringify({ value: 1 }));
    assert.equal(readDraft("offer:create"), null);
  });
});

test("le chiavi di gite e offerte diverse non si sovrascrivono", () => {
  withFakeStorage(() => {
    writeDraft("excursion:edit:abc", { name: "gita" });
    writeDraft("excursion:edit:xyz", { name: "altra gita" });
    writeDraft("offer:create", { name: "offerta" });

    assert.equal(
      readDraft<{ name: string }>("excursion:edit:abc")?.value.name,
      "gita",
    );
    assert.equal(
      readDraft<{ name: string }>("excursion:edit:xyz")?.value.name,
      "altra gita",
    );
    assert.equal(
      readDraft<{ name: string }>("offer:create")?.value.name,
      "offerta",
    );
  });
});

test("removeDraft cancella solo la bozza indicata", () => {
  withFakeStorage(() => {
    writeDraft("excursion:create", { a: 1 });
    writeDraft("offer:create", { b: 2 });

    removeDraft("excursion:create");

    assert.equal(readDraft("excursion:create"), null);
    assert.notEqual(readDraft("offer:create"), null);
  });
});

test("la pulizia toglie le bozze scadute e lascia intatte quelle valide", () => {
  withFakeStorage((values) => {
    values.set(
      draftStorageKey("scaduta-1"),
      JSON.stringify({ savedAt: Date.now() - DRAFT_TTL_MS * 2, value: {} }),
    );
    values.set(
      draftStorageKey("scaduta-2"),
      JSON.stringify({ savedAt: Date.now() - DRAFT_TTL_MS * 3, value: {} }),
    );
    values.set(
      draftStorageKey("viva"),
      JSON.stringify({ savedAt: Date.now(), value: { ok: true } }),
    );
    // Chiave di un'altra funzionalita': non deve essere toccata.
    values.set("elis_cookie_consent", "accepted");

    pruneExpiredDrafts();

    assert.equal(values.has(draftStorageKey("scaduta-1")), false);
    assert.equal(values.has(draftStorageKey("scaduta-2")), false);
    assert.equal(values.has(draftStorageKey("viva")), true);
    assert.equal(values.get("elis_cookie_consent"), "accepted");
  });
});

test("uno storage non disponibile non fa fallire lettura e scrittura", () => {
  const target = globalThis as unknown as { window?: unknown };
  const previous = target.window;
  delete target.window;
  try {
    assert.doesNotThrow(() => writeDraft("excursion:create", { a: 1 }));
    assert.equal(readDraft("excursion:create"), null);
    assert.doesNotThrow(() => removeDraft("excursion:create"));
    assert.doesNotThrow(() => pruneExpiredDrafts());
  } finally {
    if (previous) target.window = previous;
  }
});

test("una quota piena non propaga l'errore al form", () => {
  withFakeStorage(
    () => {
      assert.doesNotThrow(() => writeDraft("excursion:create", { a: 1 }));
    },
    { failOnSet: true },
  );
});

test("descrive l'eta' della bozza in italiano", () => {
  const now = Date.now();
  assert.equal(describeDraftAge(now - 5_000, now), "pochi secondi fa");
  assert.equal(describeDraftAge(now - 60_000, now), "1 minuto fa");
  assert.equal(describeDraftAge(now - 12 * 60_000, now), "12 minuti fa");
  assert.equal(describeDraftAge(now - 60 * 60_000, now), "1 ora fa");
  assert.equal(describeDraftAge(now - 5 * 60 * 60_000, now), "5 ore fa");
  assert.equal(describeDraftAge(now - 24 * 60 * 60_000, now), "1 giorno fa");
  assert.equal(
    describeDraftAge(now - 3 * 24 * 60 * 60_000, now),
    "3 giorni fa",
  );
});
