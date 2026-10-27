/* ==========================================================================
   Pure helpers for the Etimad function: no network, no database, so the same
   file runs in the edge function (Deno) and in the Node tests.

   Firecrawl's Etimad provider returns JSON whose exact key names we only
   learn at run time (the catalogue is read from Firecrawl itself), so the
   mapping here is deliberately tolerant: it looks a field up under the names
   a scraper of that page is likely to use, at any depth.
   ========================================================================== */

/* What we build, as Arabic and English patterns over a tender's name and
   activity. Order matters only for display. */
export const SCOPES = {
  stands: /معرض|معارض|جناح|أجنح|منص[ةه] عرض|اكسبو|إكسبو|exhibit|expo\b|booth|pavilion|\bstands?\b/i,
  events: /فعالي|مؤتمر|ملتق|منتد|حفل|احتفال|مهرجان|تنظيم (?:ال)?(?:فعاليات|مناسب|ورش|لقاء)|مناسب[ةا]ت|event|conference|forum|summit|ceremon|festival|gala/i,
  fitout: /تجهيز|تأثيث|ديكور|تصميم داخلي|متحف|متاحف|معرض دائم|fit[- ]?out|interior|furnish|museum|galler/i,
  marketing: /تسويق|هوي[ةه] بصري|علام[ةه] تجاري|لوحات|لافتات|إعلان|اعلان|حمل[ةه]|إنتاج (?:مرئي|فيديو|إعلامي)|طباع[ةه]|marketing|brand|signage|campaign|advertis|media production|activation|printing/i,
};

/** Which of our scopes a text touches, and the words that matched. */
export function classify(text) {
  const s = String(text || '');
  const scopes = [], hits = [];
  for (const [k, re] of Object.entries(SCOPES)) {
    const m = s.match(re);
    if (m) { scopes.push(k); hits.push(m[0]); }
  }
  return { scopes, hits: [...new Set(hits)] };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const norm = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

/** First non-empty value found under any of `names` (case/underscore
    insensitive), searching nested objects breadth-first. */
export function pick(obj, names, depth = 3) {
  const want = names.map(norm);
  let level = [obj];
  for (let d = 0; d <= depth && level.length; d++) {
    const next = [];
    for (const o of level) {
      if (!isObj(o)) continue;
      for (const w of want) {
        for (const [k, v] of Object.entries(o)) {
          if (norm(k) === w && v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) return v;
        }
      }
      for (const v of Object.values(o)) if (isObj(v)) next.push(v); else if (Array.isArray(v)) next.push(...v.filter(isObj).slice(0, 5));
    }
    level = next;
  }
  return undefined;
}

const AR_DIGITS = /[٠-٩]/g;
const latin = (s) => String(s).replace(AR_DIGITS, (c) => String(c.charCodeAt(0) - 0x660));

/** A Gregorian date (YYYY-MM-DD) from ISO, "DD/MM/YYYY", or "YYYY/MM/DD"
    text, or null. Hijri years (14xx) are refused rather than misread. */
export function toDate(v) {
  if (v == null || v === '') return null;
  if (isObj(v)) return toDate(pick(v, ['gregorian', 'date', 'value', 'iso']));
  const s = latin(v).trim();
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  let y, mo, d;
  if (m) { [, y, mo, d] = m; } else if ((m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) { [, d, mo, y] = m; } else return null;
  y = +y; mo = +mo; d = +d;
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Date and, when present, time as an ISO instant in Riyadh time (+03:00). */
export function toInstant(v, timeV) {
  const d = toDate(v);
  if (!d) return null;
  const src = latin(`${isObj(v) ? JSON.stringify(v) : v} ${timeV || ''}`);
  const t = src.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(ص|م|AM|PM|am|pm)?/);
  let hh = 23, mm = 59;
  if (t) {
    hh = +t[1]; mm = +t[2];
    const ap = t[3];
    if (ap && /م|pm/i.test(ap) && hh < 12) hh += 12;
    if (ap && /ص|am/i.test(ap) && hh === 12) hh = 0;
  }
  return `${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+03:00`;
}

/** A number from "1,500.00 ريال", "١٥٠٠", 1500 → 1500; anything else → null. */
export function toNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (isObj(v)) return toNum(pick(v, ['amount', 'value', 'sar', 'price']));
  const s = latin(v).replace(/[٬,\s]/g, '').replace('٫', '.');
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

const str = (v) => {
  if (v == null) return null;
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join('، ') || null;
  if (isObj(v)) return str(pick(v, ['name', 'value', 'label', 'text', 'ar', 'title']));
  const s = String(v).trim();
  return s || null;
};
const list = (v) => {
  if (v == null) return [];
  const a = Array.isArray(v) ? v : String(v).split(/[,،;|\n]+/);
  return [...new Set(a.map(str).filter(Boolean).map(s => s.trim()))].slice(0, 20);
};

/** The id Etimad uses in its links (STenderId=…), from a row or a URL. */
export function tenderIdOf(o, depth = 3) {
  const direct = str(pick(o, ['tender_id_string', 'tenderIdString', 'tenderIdStr', 'idString', 'STenderId', 'tender_id'], depth));
  if (direct && !/^\d+$/.test(direct)) return direct;
  const url = str(pick(o, ['source_url', 'url', 'link', 'details_url', 'detailsUrl'], depth));
  const m = url && url.match(/STenderId=([^&#]+)/i);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
  return direct || null;
}

/** One Etimad tender (search row or full details) → etimad_tenders columns. */
export function normTender(o) {
  const id = tenderIdOf(o);
  if (!id) return null;
  const name = str(pick(o, ['tender_name', 'tenderName', 'name', 'title'])) || '';
  const activity = str(pick(o, ['activities', 'activity', 'tender_activity', 'activityName', 'classification_field', 'classificationField']));
  const cls = classify(`${name} ${activity || ''} ${str(pick(o, ['purpose', 'description'])) || ''}`);
  const dates = pick(o, ['dates']) || o;
  const row = {
    tender_id_string: id,
    tender_number: str(pick(o, ['tender_number', 'tenderNumber', 'number'])),
    reference_number: str(pick(o, ['reference_number', 'referenceNumber', 'ref'])),
    name,
    agency: str(pick(o, ['agency_name', 'agencyName', 'agency', 'government_entity', 'entity'])),
    tender_type: str(pick(o, ['tender_type', 'tenderType', 'type', 'tender_type_name'])),
    status: str(pick(o, ['status', 'tender_status', 'tenderStatus'])),
    activity,
    regions: list(pick(o, ['regions', 'region', 'execution_place', 'executionPlace', 'execution_regions'])),
    published_on: toDate(pick(dates, ['published_date', 'publish_date', 'publication_date', 'submission_date', 'created_date', 'date_published', 'publishDate'])),
    last_offer_at: toInstant(pick(dates, ['last_offer_presentation_date', 'lastOfferPresentationDate', 'last_offer_date', 'offers_deadline', 'submission_deadline', 'deadline']),
      str(pick(dates, ['last_offer_presentation_time', 'lastOfferPresentationTime']))),
    opening_at: toInstant(pick(dates, ['offers_opening_date', 'offersOpeningDate', 'opening_date']),
      str(pick(dates, ['offers_opening_time', 'offersOpeningTime']))),
    expected_award_on: toDate(pick(dates, ['expected_award_date', 'expectedAwardDate', 'award_date'])),
    documents_price: toNum(pick(o, ['documents_price', 'documentsPrice', 'condetional_booklet_price', 'booklet_price', 'conditions_booklet_price'])),
    contract_duration: str(pick(o, ['contract_duration', 'contractDuration', 'duration'])),
    source_url: str(pick(o, ['source_url', 'sourceUrl', 'url', 'details_url'])) ||
      `https://tenders.etimad.sa/Tender/DetailsForVisitor?STenderId=${encodeURIComponent(id)}`,
    scopes: cls.scopes,
    keyword_hits: cls.hits,
  };
  return row;
}

/** Every tender-like object in a search response, wherever the list sits. */
export function findTenders(data, max = 500) {
  const out = [], seen = new Set();
  const walk = (v, d) => {
    if (d > 6 || out.length >= max) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, d + 1); return; }
    if (!isObj(v)) return;
    /* Both on the object itself: a wrapper that merely contains tenders
       would otherwise match through its children. */
    const looks = (tenderIdOf(v, 0) && pick(v, ['tender_name', 'tenderName', 'name', 'title'], 0));
    if (looks) {
      const id = tenderIdOf(v, 0);
      if (!seen.has(id)) { seen.add(id); out.push(v); }
      return;
    }
    for (const x of Object.values(v)) walk(x, d + 1);
  };
  walk(data, 0);
  return out;
}

/** Award / opening results if the details carry them: supplier, price, won. */
export function awardsFrom(details) {
  const out = [];
  const walk = (v, key, d) => {
    if (d > 6) return;
    if (Array.isArray(v)) {
      const rows = v.filter(isObj);
      if (rows.length && /award|winner|supplier|offer|bidder|ترسي|عرض|مورد/i.test(key)) {
        for (const r of rows) {
          const name = str(pick(r, ['supplier_name', 'supplierName', 'supplier', 'company', 'vendor', 'name', 'bidder', 'المورد'], 1));
          const value = toNum(pick(r, ['awarded_value', 'award_value', 'awardValue', 'offer_value', 'offerValue', 'financial_offer', 'price', 'value', 'amount', 'total'], 1));
          if (!name) continue;
          const wonV = pick(r, ['awarded', 'is_awarded', 'won', 'winner', 'status'], 1);
          const wv = String(wonV ?? '');
          const won = /غير|not|lost|خاسر|false|مستبعد|rejected/i.test(wv) ? false
            : /award|ترسي|فائز|true|winner/i.test(wv) || /award|winner|ترسي/i.test(key);
          out.push({ supplier: name, value_sar: value, won });
        }
        return;
      }
      for (const x of v) walk(x, key, d + 1);
      return;
    }
    if (isObj(v)) for (const [k, x] of Object.entries(v)) walk(x, k, d + 1);
  };
  walk(details, '', 0);
  const seen = new Set();
  return out.filter(a => { const k = `${a.supplier}|${a.value_sar}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/* ------------------------------------------------------- Firecrawl catalogue */

/** The provider's tools from a find-tools result, as [{capability, options}]. */
export function toolsFrom(found) {
  const items = (found && (found.items || found.tools || found.results)) || (Array.isArray(found) ? found : []);
  return items.filter(isObj).map(t => ({
    provider: t.provider || t.next?.provider || null,
    capability: t.capability || t.next?.capability || t.name || null,
    description: t.description || t.summary || null,
    options: t.options || t.inputSchema || t.input_schema || t.schema || null,
    price: t.price ?? t.credits ?? t.cost ?? null,
  })).filter(t => t.capability);
}

const propsOf = (schema) => {
  if (!schema) return {};
  if (isObj(schema.properties)) return schema.properties;
  if (Array.isArray(schema)) return Object.fromEntries(schema.filter(isObj).map(p => [p.name || p.key, p]));
  if (isObj(schema)) return schema;
  return {};
};

/** The search tool, and options for one keyword from its schema. */
export function searchCall(tools, keyword, page = 1) {
  const t = (tools || []).find(x => /search_tenders/i.test(x.capability))
    || (tools || []).find(x => /search/i.test(x.capability) && /tender/i.test(x.capability))
    || { capability: 'public-procurement-tenders/search_tenders', options: null };
  const props = propsOf(t.options);
  const names = Object.keys(props);
  const find = (re) => names.find(n => re.test(n));
  const options = {};
  const kw = find(/^(keyword|keywords|query|q|search|search_text|searchtext|text|tender_name|name)$/i) || (names.length ? null : 'keyword');
  if (kw) options[kw] = keyword;
  const pg = find(/^(page|page_number|pagenumber)$/i) || (names.length ? null : 'page');
  if (pg && page > 1) options[pg] = page;
  const sz = find(/^(page_size|pagesize|limit|size|per_page)$/i);
  if (sz) {
    const mx = Number(props[sz]?.maximum) || 50;
    options[sz] = Math.min(mx, 50);
  }
  return { capability: t.capability, options };
}
