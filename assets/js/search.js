(function () {
  "use strict";

  const SEARCH_CONFIG = Object.freeze({
    queryParameter: "q",
    listingParameter: "listing",
    emptyMessage: "Enter a place, hotel, restaurant, activity, or guide to search VisitGenSan.",
    loadingMessage: "Searching VisitGenSan...",
    errorMessage: "VisitGenSan search is temporarily unavailable. Please browse a section below or try again.",
    searchableFields: Object.freeze({
      category: ["category", "guideLabel", "score"],
      keywords: ["keywords", "tags", "label"],
      details: [
        "description",
        "bio",
        "location",
        "amenities",
        "facilities",
        "details",
        "highlights",
        "facts",
        "roomOfferings",
        "otherFacilities",
        "dining",
        "activities"
      ]
    }),
    compoundTerms: Object.freeze([
      "affordable hotel",
      "beach resort",
      "budget hotel",
      "coffee shop",
      "low cost",
      "swimming pool",
      "things to do",
      "tourist spot",
      "travel guide",
      "trip plan"
    ]),
    scoring: Object.freeze({
      singleTermMinimum: 1,
      multipleTermMinimum: 200,
      exactTitle: 1200,
      titleStartsWithQuery: 900,
      exactCategory: 650,
      categoryContainsQuery: 500,
      allOriginalTerms: 180,
      originalTerm: Object.freeze({ title: 180, category: 140, keywords: 100, details: 45 }),
      synonymTerm: Object.freeze({ title: 85, category: 75, keywords: 55, details: 25 })
    }),
    intentMappings: Object.freeze([
      Object.freeze({ triggers: ["affordable", "cheap", "low cost", "economical"], expansions: ["budget", "affordable"] }),
      Object.freeze({ triggers: ["accommodation", "stay", "lodging"], expansions: ["hotel", "resort"] }),
      Object.freeze({ triggers: ["beach", "seaside", "coastal", "shore"], expansions: ["beach resort", "beach attraction", "beach escape"] }),
      Object.freeze({ triggers: ["food", "eat", "dining"], expansions: ["restaurant", "food guide"] }),
      Object.freeze({ triggers: ["coffee", "cafe", "café"], expansions: ["cafe", "coffee shop"] }),
      Object.freeze({ triggers: ["sightseeing", "attraction", "tourist spot"], expansions: ["things to do", "activity"] }),
      Object.freeze({ triggers: ["itinerary", "trip plan"], expansions: ["travel guide"] }),
      Object.freeze({ triggers: ["pool", "swimming"], expansions: ["swimming pool", "pool"] }),
      Object.freeze({ triggers: ["events", "event", "function", "meeting"], expansions: ["event venue", "meeting venue"] })
    ]),
    sources: Object.freeze([
      Object.freeze({
        id: "hotels",
        dataUrl: "data/hotels.json",
        listingType: "Hotel & Resort",
        categoryStyle: "hotel",
        directUrlFields: ["guideUrl"],
        collectionUrl: "hotels.html",
        collectionHash: "hotel-guide",
        resultAction: "View Listing"
      }),
      Object.freeze({
        id: "activities",
        dataUrl: "data/activities.json",
        listingType: "Things to Do",
        categoryStyle: "prefixed",
        directUrlFields: ["url"],
        collectionUrl: "things-to-do.html",
        resultAction: "Open Guide"
      }),
      Object.freeze({
        id: "restaurants",
        dataUrl: "data/restaurants.json",
        listingType: "Restaurant",
        categoryStyle: "source",
        directUrlFields: ["url"],
        collectionUrl: "food-restaurants.html",
        resultAction: "View Listing"
      }),
      Object.freeze({
        id: "guides",
        dataUrl: "data/guides.json",
        listingType: "Travel Guide",
        categoryStyle: "source",
        directUrlFields: ["url"],
        requireDirectUrl: true,
        resultAction: "Open Guide"
      }),
      Object.freeze({
        id: "pages",
        dataUrl: "data/search-pages.json",
        listingType: "VisitGenSan Page",
        categoryStyle: "source",
        directUrlFields: ["url"],
        requireDirectUrl: true,
        resultAction: "Open Guide"
      })
    ]),
    browseLinks: Object.freeze([
      Object.freeze({ label: "Hotels & Resorts", url: "hotels.html" }),
      Object.freeze({ label: "Things To Do", url: "things-to-do.html" }),
      Object.freeze({ label: "Food & Restaurants", url: "food-restaurants.html" }),
      Object.freeze({ label: "Travel Guides", url: "travel-guides.html" })
    ])
  });

  const initializedSearchForms = new WeakSet();

  function stemToken(token) {
    if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
    if (token.length > 4 && token.endsWith("es") && !token.endsWith("sses")) return token.slice(0, -2);
    if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
    return token;
  }

  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(stemToken)
      .join(" ");
  }

  function uniqueTokens(value) {
    return [...new Set(normalizeText(value).split(" ").filter(Boolean))];
  }

  function splitQueryTerms(value) {
    const normalizedValue = normalizeText(value);
    let remainder = ` ${normalizedValue} `;
    const terms = [];
    const compounds = SEARCH_CONFIG.compoundTerms.map(normalizeText).sort((left, right) => right.length - left.length);

    compounds.forEach((compound) => {
      if (!includesPhrase(normalizedValue, compound)) return;
      terms.push(compound);
      remainder = remainder.replace(` ${compound} `, " ");
    });

    terms.push(...uniqueTokens(remainder));
    return [...new Set(terms)];
  }

  function includesPhrase(text, phrase) {
    if (!text || !phrase) return false;
    return ` ${text} `.includes(` ${phrase} `);
  }

  function expandSearchIntent(query) {
    const normalizedQuery = normalizeText(query);
    const originalTerms = splitQueryTerms(normalizedQuery);
    const expandedTerms = new Set(originalTerms);

    SEARCH_CONFIG.intentMappings.forEach((mapping) => {
      const normalizedTriggers = mapping.triggers.map(normalizeText);
      const mappingMatches = normalizedTriggers.some((term) => includesPhrase(normalizedQuery, term));

      if (mappingMatches) {
        mapping.expansions.map(normalizeText).forEach((term) => expandedTerms.add(term));
      }
    });

    return {
      phrase: normalizedQuery,
      originalTerms,
      synonymTerms: [...expandedTerms].filter((term) => !originalTerms.includes(term))
    };
  }

  function collectStrings(value, output = []) {
    if (typeof value === "string" || typeof value === "number") {
      output.push(String(value));
      return output;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => collectStrings(item, output));
      return output;
    }

    if (value && typeof value === "object") {
      Object.values(value).forEach((item) => collectStrings(item, output));
    }

    return output;
  }

  function collectFields(record, fieldNames) {
    return fieldNames.flatMap((fieldName) => collectStrings(record?.[fieldName])).join(" ");
  }

  function firstString(record, fieldNames) {
    for (const fieldName of fieldNames) {
      const value = record?.[fieldName];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  function validateInternalUrl(value, allowedExtensions = [".html", "/"]) {
    const candidateValue = String(value || "").trim();
    if (!candidateValue || candidateValue === "#" || candidateValue.startsWith("//")) return "";

    try {
      const candidate = new URL(candidateValue, window.location.href);
      if (candidate.origin !== window.location.origin || !["http:", "https:"].includes(candidate.protocol)) return "";
      const lowerPath = candidate.pathname.toLocaleLowerCase();
      const isAllowed = allowedExtensions.some((extension) => extension === "/" ? lowerPath === "/" : lowerPath.endsWith(extension));
      if (!isAllowed) return "";
      return `${candidate.pathname}${candidate.search}${candidate.hash}`;
    } catch (error) {
      return "";
    }
  }

  function validateImageUrl(value) {
    return validateInternalUrl(value, [".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
  }

  function formatCategory(record, source) {
    const category = firstString(record, ["category"]);
    if (source.categoryStyle === "hotel") {
      if (!category) return source.listingType;
      return normalizeText(category) === "resort" ? "Resort" : `${category} Hotel`;
    }
    if (source.categoryStyle === "prefixed") {
      return category ? `${source.listingType} · ${category}` : source.listingType;
    }
    return category || source.listingType;
  }

  function buildCollectionUrl(source, title) {
    const baseUrl = validateInternalUrl(source.collectionUrl);
    if (!baseUrl || !title) return "";
    const [path, hash = ""] = baseUrl.split("#");
    const separator = path.includes("?") ? "&" : "?";
    const listingQuery = `${encodeURIComponent(SEARCH_CONFIG.listingParameter)}=${encodeURIComponent(title)}`;
    const finalHash = source.collectionHash || hash;
    return `${path}${separator}${listingQuery}${finalHash ? `#${finalHash}` : ""}`;
  }

  function resolveRecordUrl(record, source) {
    for (const fieldName of source.directUrlFields || []) {
      const directUrl = validateInternalUrl(record?.[fieldName]);
      if (directUrl) return { url: directUrl, priority: 2 };
    }

    if (source.requireDirectUrl) return { url: "", priority: 0 };
    return { url: buildCollectionUrl(source, record?.title), priority: 1 };
  }

  function createSearchRecord(record, source, index) {
    if (!record || typeof record !== "object") return null;
    const title = firstString(record, ["title", "name"]);
    const resolvedUrl = resolveRecordUrl(record, source);
    if (!title || !resolvedUrl.url) return null;

    const description = firstString(record, ["description", "summary", "bio"]);
    const category = formatCategory(record, source);
    const keywords = collectFields(record, SEARCH_CONFIG.searchableFields.keywords);
    const details = collectFields(record, SEARCH_CONFIG.searchableFields.details);
    const location = firstString(record, ["location", "address"]);
    const galleryImage = Array.isArray(record.gallery) ? firstString(record.gallery[0], ["thumbnail", "src"]) : "";
    const image = validateImageUrl(firstString(record, ["image", "thumbnail"]) || galleryImage);
    const verified = record.verified === true ? true : record.verified === false ? false : null;
    const idSeed = firstString(record, ["id", "slug"]) || title;

    return {
      id: `${source.id}:${normalizeText(idSeed).replaceAll(" ", "-") || index}`,
      title,
      category,
      listingType: source.listingType,
      description,
      keywords,
      amenities: collectFields(record, ["amenities", "facilities"]),
      location,
      image,
      url: resolvedUrl.url,
      verified,
      actionLabel: source.resultAction,
      urlPriority: resolvedUrl.priority,
      searchFields: {
        title: normalizeText(title),
        category: normalizeText(category),
        keywords: normalizeText(`${keywords} ${collectFields(record, SEARCH_CONFIG.searchableFields.category)}`),
        details: normalizeText(`${details} ${location}`)
      }
    };
  }

  function mergeSearchRecords(records) {
    const merged = new Map();

    records.forEach((record) => {
      const key = normalizeText(record.title);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, record);
        return;
      }

      const preferredUrl = record.urlPriority > existing.urlPriority ? record : existing;
      existing.url = preferredUrl.url;
      existing.urlPriority = preferredUrl.urlPriority;
      existing.description = existing.description || record.description;
      existing.location = existing.location || record.location;
      existing.image = existing.image || record.image;
      existing.verified = existing.verified === false || record.verified === false
        ? false
        : existing.verified === true || record.verified === true ? true : null;
      existing.keywords = `${existing.keywords} ${record.keywords}`.trim();
      existing.amenities = `${existing.amenities} ${record.amenities}`.trim();
      Object.keys(existing.searchFields).forEach((fieldName) => {
        existing.searchFields[fieldName] = normalizeText(`${existing.searchFields[fieldName]} ${record.searchFields[fieldName]}`);
      });
    });

    return [...merged.values()];
  }

  async function loadSearchSource(source) {
    const response = await fetch(source.dataUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load ${source.id}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error(`Invalid search data for ${source.id}`);
    return data.map((record, index) => createSearchRecord(record, source, index)).filter(Boolean);
  }

  async function loadSearchIndex() {
    const sourceResults = await Promise.allSettled(SEARCH_CONFIG.sources.map(loadSearchSource));
    const records = sourceResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const failedSources = sourceResults.filter((result) => result.status === "rejected").length;
    return { records: mergeSearchRecords(records), failedSources };
  }

  function scoreTerm(fields, term, weights) {
    return Math.max(...Object.entries(weights).map(([fieldName, fieldWeight]) => (
      includesPhrase(fields[fieldName], term) ? fieldWeight : 0
    )));
  }

  function scoreRecord(record, intent) {
    const fields = record.searchFields;
    const weights = SEARCH_CONFIG.scoring;
    let score = 0;

    if (fields.title === intent.phrase) score += weights.exactTitle;
    else if (fields.title.startsWith(`${intent.phrase} `)) score += weights.titleStartsWithQuery;

    if (fields.category === intent.phrase) score += weights.exactCategory;
    else if (includesPhrase(fields.category, intent.phrase)) score += weights.categoryContainsQuery;

    intent.originalTerms.forEach((term) => {
      score += scoreTerm(fields, term, weights.originalTerm);
    });

    intent.synonymTerms.forEach((term) => {
      score += scoreTerm(fields, term, weights.synonymTerm);
    });

    const combinedFields = Object.values(fields).join(" ");
    if (intent.originalTerms.length && intent.originalTerms.every((term) => includesPhrase(combinedFields, term))) {
      score += weights.allOriginalTerms;
    }

    return score;
  }

  function searchRecords(records, query) {
    const intent = expandSearchIntent(query);
    if (!intent.phrase) return [];
    const minimumScore = intent.originalTerms.length > 1
      ? SEARCH_CONFIG.scoring.multipleTermMinimum
      : SEARCH_CONFIG.scoring.singleTermMinimum;

    const ranked = records
      .map((record) => ({ record, score: scoreRecord(record, intent) }))
      .filter((result) => result.score >= minimumScore)
      .sort((left, right) => right.score - left.score || left.record.title.localeCompare(right.record.title));

    const seen = new Set();
    return ranked.filter(({ record }) => {
      const key = `${normalizeText(record.title)}|${record.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function createResultCard(record) {
    const link = createElement("a", "search-result-card");
    link.href = record.url;
    link.setAttribute("aria-label", `${record.actionLabel}: ${record.title}`);

    const media = createElement("div", "search-result-media");
    if (record.image) {
      const image = document.createElement("img");
      image.src = record.image;
      image.alt = `${record.title} thumbnail`;
      image.loading = "lazy";
      image.decoding = "async";
      media.append(image);
    } else {
      media.append(createElement("span", "search-result-placeholder", record.listingType));
    }

    const body = createElement("div", "search-result-body");
    const meta = createElement("div", "search-result-meta");
    meta.append(createElement("span", "meta", record.category));
    if (record.verified === false) meta.append(createElement("span", "search-verification-badge is-unverified", "Not yet verified"));
    if (record.verified === true) meta.append(createElement("span", "search-verification-badge is-verified", "Verified listing"));

    body.append(meta, createElement("h2", "", record.title));
    if (record.description) body.append(createElement("p", "search-result-description", record.description));
    if (record.location) body.append(createElement("p", "search-result-location", record.location));
    body.append(createElement("span", "card-link search-result-action", record.actionLabel));
    link.append(media, body);
    return link;
  }

  function appendBrowseLinks(container) {
    const links = createElement("nav", "search-browse-links");
    links.setAttribute("aria-label", "Browse VisitGenSan sections");
    SEARCH_CONFIG.browseLinks.forEach((item) => {
      const link = createElement("a", "", item.label);
      link.href = item.url;
      links.append(link);
    });
    container.append(links);
  }

  function renderState(container, title, message, suggestions = []) {
    container.replaceChildren();
    const panel = createElement("section", "search-state-panel");
    panel.append(createElement("h2", "", title), createElement("p", "", message));
    if (suggestions.length) {
      const list = document.createElement("ul");
      suggestions.forEach((suggestion) => list.append(createElement("li", "", suggestion)));
      panel.append(list);
    }
    appendBrowseLinks(panel);
    container.append(panel);
  }

  function renderResults(container, results) {
    container.replaceChildren();
    const grid = createElement("div", "search-results-grid");
    results.forEach(({ record }) => grid.append(createResultCard(record)));
    container.append(grid);
  }

  function getQueryFromLocation() {
    try {
      return String(new URLSearchParams(window.location.search).get(SEARCH_CONFIG.queryParameter) || "").trim();
    } catch (error) {
      return "";
    }
  }

  function buildSearchUrl(form, query) {
    const target = new URL(form.action || "search.html", window.location.href);
    target.search = "";
    target.searchParams.set(SEARCH_CONFIG.queryParameter, query.trim());
    return target.href;
  }

  function handleSearchFormSubmit(event) {
    const form = event.currentTarget;
    const input = form.querySelector('input[name="q"]');
    const message = form.querySelector("[data-search-form-message]");
    if (!input) return;

    const query = String(input.value || "");
    event.preventDefault();

    if (!normalizeText(query)) {
      if (message) message.textContent = SEARCH_CONFIG.emptyMessage;
      input.focus();
      return;
    }

    if (message) message.textContent = "";
    try {
      window.location.assign(buildSearchUrl(form, query));
    } catch (error) {
      if (message) message.textContent = SEARCH_CONFIG.errorMessage;
    }
  }

  function forwardEnterToFormSubmit(event) {
    const form = event.currentTarget.form;
    if (event.key !== "Enter" || event.isComposing || event.defaultPrevented || !form) return;
    if (typeof form.requestSubmit !== "function") return;

    event.preventDefault();
    form.requestSubmit();
  }

  function initializeSearchForms() {
    const currentQuery = getQueryFromLocation();
    document.querySelectorAll("[data-site-search-form]").forEach((form) => {
      if (initializedSearchForms.has(form)) return;

      const input = form.querySelector('input[name="q"]');
      const message = form.querySelector("[data-search-form-message]");
      if (!input) return;
      if (form.closest("[data-search-page]") && currentQuery) input.value = currentQuery;

      form.addEventListener("submit", handleSearchFormSubmit);
      input.addEventListener("keydown", forwardEnterToFormSubmit);
      input.addEventListener("input", () => {
        if (message?.textContent) message.textContent = "";
      });
      initializedSearchForms.add(form);
    });
  }

  async function initializeSearchResults() {
    const page = document.querySelector("[data-search-page]");
    const container = document.querySelector("[data-search-results]");
    const heading = document.querySelector("[data-search-heading]");
    const status = document.querySelector("[data-search-status]");
    if (!page || !container || !heading || !status) return;

    const query = getQueryFromLocation();
    if (!normalizeText(query)) {
      heading.textContent = "Search VisitGenSan";
      status.textContent = SEARCH_CONFIG.emptyMessage;
      renderState(container, "Start your search", SEARCH_CONFIG.emptyMessage);
      return;
    }

    heading.textContent = `Search results for “${query}”`;
    status.textContent = SEARCH_CONFIG.loadingMessage;

    try {
      const { records, failedSources } = await loadSearchIndex();
      if (!records.length) throw new Error("Search index is empty");
      const results = searchRecords(records, query);

      if (!results.length) {
        const noResultsMessage = `No VisitGenSan results found for “${query}”.`;
        status.textContent = noResultsMessage;
        renderState(container, "No results found", noResultsMessage, [
          "Check the spelling.",
          "Try a broader term such as hotel, resort, food, beach, or travel guide."
        ]);
        return;
      }

      const countLabel = results.length === 1 ? "1 match" : `${results.length} matches`;
      status.textContent = failedSources
        ? `${countLabel}. Some VisitGenSan sections could not be loaded.`
        : countLabel;
      renderResults(container, results);
    } catch (error) {
      status.textContent = SEARCH_CONFIG.errorMessage;
      renderState(container, "Search temporarily unavailable", SEARCH_CONFIG.errorMessage);
    }
  }

  const SearchApi = Object.freeze({
    config: SEARCH_CONFIG,
    normalizeText,
    expandSearchIntent,
    loadSearchIndex,
    scoreRecord,
    searchRecords
  });

  window.VisitGenSanSearch = SearchApi;
  initializeSearchForms();
  initializeSearchResults();
}());
