const fallbackData = {
  hotels: [
    {
      title: "City Center Business Stay",
      category: "Hotel sample",
      description: "A placeholder card for accommodations near offices, malls, transport, and dinner options.",
      label: "Replace with verified hotel",
      url: "#"
    },
    {
      title: "Family-Friendly Mall Area Stay",
      category: "Hotel sample",
      description: "A draft listing bucket for families who want easy access to food, shopping, and parking.",
      label: "Add real listing details",
      url: "#"
    },
    {
      title: "Airport Access Inn",
      category: "Hotel sample",
      description: "A sample option category for travelers who want simpler airport-to-city movement.",
      label: "Verify before publishing",
      url: "#"
    }
  ],
  restaurants: [
    {
      title: "Tuna and Seafood Place",
      category: "Food sample",
      description: "Use this card for a verified seafood restaurant with original photos, menu notes, and map link.",
      label: "Add verified restaurant",
      url: "#"
    },
    {
      title: "Cafe for Work or Study",
      category: "Food sample",
      description: "A useful category for visitors looking for coffee, Wi-Fi, quiet tables, and light meals.",
      label: "Add cafe details",
      url: "#"
    },
    {
      title: "Local Budget Meal Spot",
      category: "Food sample",
      description: "A starter card for affordable local meals once prices, hours, and location are checked.",
      label: "Verify food spot",
      url: "#"
    }
  ],
  activities: [
    {
      title: "Seafood Culture Stop",
      category: "Activity sample",
      description: "A content bucket for visitor-friendly seafood or fish-port culture notes after access is verified.",
      label: "Check visitor access",
      url: "#"
    },
    {
      title: "Mall and Cafe Afternoon",
      category: "Activity sample",
      description: "A simple plan for first-time visitors who want an easy city day without complicated transport.",
      label: "Build itinerary",
      url: "#"
    },
    {
      title: "Nearby Beach Day Trip",
      category: "Activity sample",
      description: "A future guide bucket for Sarangani or other nearby coastal trips with fares and timing.",
      label: "Add travel details",
      url: "#"
    }
  ],
  guides: [
    {
      title: "GenSan Airport to City Guide",
      category: "Guide draft",
      description: "Explain arrival options, estimated travel time, fare reminders, and what visitors should prepare.",
      label: "Write guide",
      url: "#"
    },
    {
      title: "Getting Around GenSan",
      category: "Guide draft",
      description: "Cover common transport options, local tips, parking notes, and route planning basics.",
      label: "Write guide",
      url: "#"
    },
    {
      title: "Weekend GenSan Starter Plan",
      category: "Guide draft",
      description: "A visitor-friendly itinerary combining hotel check-in, food, city stops, and nearby trips.",
      label: "Write itinerary",
      url: "#"
    }
  ]
};

const itemCache = {};

const categoryNotes = {
  hotels: {
    Business: "Business hotels are ideal for work trips, offering convenient locations, reliable Wi-Fi, comfortable rooms, and easy access to meetings, offices, transport, and city essentials.",
    Family: "Family hotels are ideal for parents, children, and small groups, offering spacious rooms, convenient locations, easy food access, and a comfortable setup for relaxed city stays.",
    Budget: "Budget hotels are ideal for travelers who want affordable stays, simple essentials, convenient locations, and practical comfort for short trips or city visits."
  }
};

const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");
const developmentPreviewHosts = ["localhost", "127.0.0.1"];
const productionDevelopmentHosts = ["visitgensan.com", "www.visitgensan.com", "visitgensan.pages.dev"];
const isLocalDevelopmentPreview = developmentPreviewHosts.includes(window.location.hostname);
const isProductionDevelopmentHost = productionDevelopmentHosts.includes(window.location.hostname);
const isUnderDevelopmentPage = document.body.classList.contains("under-development-home");
// Localhost is for development preview only. Production hosts stay in under-development mode until launch.
const isDevelopmentLocked = isUnderDevelopmentPage && !isLocalDevelopmentPreview;

if (isUnderDevelopmentPage) {
  document.body.classList.toggle("is-development-preview", isLocalDevelopmentPreview);
  document.body.classList.toggle("is-development-locked", isDevelopmentLocked || isProductionDevelopmentHost);

  if (isLocalDevelopmentPreview) {
    document.querySelectorAll("[aria-disabled='true']").forEach((element) => {
      element.removeAttribute("aria-disabled");
    });
    document.querySelectorAll(".development-disabled-control input, .development-disabled-control button").forEach((control) => {
      control.disabled = false;
    });
  }
}

if (isDevelopmentLocked) {
  document.addEventListener("click", (event) => {
    const disabledLink = event.target.closest("a[href]");
    if (!disabledLink) return;

    const href = disabledLink.getAttribute("href") || "";
    const isHome = href === "index.html" || href === "/" || href === "#";
    const isContact = href.startsWith("mailto:");

    if (isHome || isContact) return;

    event.preventDefault();
    event.stopPropagation();
  }, true);

  document.addEventListener("submit", (event) => {
    event.preventDefault();
  }, true);
}

if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

document.querySelectorAll(".about-collage").forEach((collage) => {
  if (!("IntersectionObserver" in window)) {
    collage.classList.add("is-spread");
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-spread");
      }
    });
  }, { threshold: 0.28 });

  observer.observe(collage);
});

document.querySelectorAll(".quick-links").forEach((section) => {
  if (!("IntersectionObserver" in window)) {
    section.classList.add("is-revealed");
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-revealed");
        window.setTimeout(() => {
          entry.target.classList.add("is-reveal-done");
        }, 2100);
      }
    });
  }, { threshold: 0.22 });

  observer.observe(section);
});

document.addEventListener("click", async (event) => {
  const galleryButton = event.target.closest(".gallery-thumb");
  if (galleryButton) {
    const gallery = galleryButton.closest(".featured-hotel-gallery");
    const mainImage = gallery?.querySelector(".gallery-main img");

    if (!mainImage) return;

    event.preventDefault();
    mainImage.src = galleryButton.dataset.src;
    mainImage.alt = galleryButton.dataset.alt;
    gallery.querySelectorAll(".gallery-thumb").forEach((button) => {
      button.classList.toggle("is-active", button === galleryButton);
      button.setAttribute("aria-selected", String(button === galleryButton));
    });
    return;
  }

  const categoryButton = event.target.closest("[data-category-filter]");
  if (categoryButton) {
    event.preventDefault();
    await renderCategoryHotels(categoryButton.dataset.categoryType || "hotels", categoryButton.dataset.categoryFilter || "", true);
    return;
  }

  const guideLink = event.target.closest("[data-guide-index]");
  if (guideLink) {
    event.preventDefault();
    await renderGuideHotel(guideLink.dataset.guideType || "hotels", Number(guideLink.dataset.guideIndex || 0), true);
    return;
  }

  const carouselButton = event.target.closest("[data-carousel-button]");
  if (carouselButton) {
    const carousel = carouselButton.closest("[data-carousel]");
    const track = carousel?.querySelector("[data-carousel-track]");
    const direction = carouselButton.dataset.carouselButton === "previous" ? -1 : 1;
    const card = track?.querySelector(".listing-card");

    if (!track || !card) return;

    event.preventDefault();
    const gap = Number.parseFloat(getComputedStyle(track).columnGap || "0");
    track.scrollBy({ left: direction * (card.getBoundingClientRect().width + gap), behavior: "smooth" });
    return;
  }

  const detailsLink = event.target.closest(".details-link");
  if (!detailsLink) return;

  const target = document.querySelector(detailsLink.getAttribute("href"));
  if (!target) return;

  event.preventDefault();
  const isOpening = target.hidden;
  target.hidden = !isOpening;
  detailsLink.setAttribute("aria-expanded", String(isOpening));
  detailsLink.querySelector("strong").textContent = isOpening ? "Hide details" : "More details";

  if (isOpening) {
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
});

document.querySelectorAll("[data-list]").forEach(async (container) => {
  const type = container.dataset.list;
  const limit = Number(container.dataset.limit || 0);
  const skip = Number(container.dataset.skip || 0);
  const items = await loadItems(type);
  const insertFeaturedAfter = Number(container.dataset.insertFeaturedAfter ?? -1);
  const indexedItems = items.map((item, index) => ({ item, index }));
  const slicedItems = skip > 0 ? indexedItems.slice(skip) : indexedItems;
  let visibleItems = limit > 0 ? slicedItems.slice(0, limit) : slicedItems;

  if (skip > 0 && insertFeaturedAfter >= 0 && indexedItems[0]) {
    visibleItems = [...visibleItems];
    visibleItems.splice(insertFeaturedAfter, 0, indexedItems[0]);
    if (limit > 0) visibleItems = visibleItems.slice(0, limit);
  }

  container.innerHTML = visibleItems.map((entry) => renderCard(entry.item, entry.index, type)).join("");
});

document.querySelectorAll("[data-featured-list]").forEach(async (container) => {
  const type = container.dataset.featuredList;
  await renderGuideHotel(type, 0, false, container);
});

async function loadItems(type) {
  try {
    const response = await fetch(`data/${type}.json`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load ${type}`);
    itemCache[type] = await response.json();
    return itemCache[type];
  } catch (error) {
    itemCache[type] = fallbackData[type] || [];
    return itemCache[type];
  }
}

async function renderGuideHotel(type, index = 0, shouldScroll = false, existingContainer) {
  const items = await loadItems(type);
  const item = items[index] || items[0];
  const container = existingContainer || document.querySelector(`[data-featured-list="${type}"]`);

  if (!item || !container) return;

  const title = document.querySelector("#featured-hotel-title");
  const intro = title?.nextElementSibling;

  if (title) title.textContent = item.title;
  if (intro) {
    intro.textContent = item.guideIntro || `A local guide look at ${item.title}, with location notes, booking links, and visitor-ready details.`;
  }

  container.innerHTML = renderFeaturedCard(item);
  updateActiveCategoryButton(type, item.category);

  if (shouldScroll) {
    document.querySelector("#hotel-guide")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
async function renderCategoryHotels(type, category, shouldScroll = false) {
  const items = await loadItems(type);
  const normalizedCategory = String(category || "").toLowerCase();
  const matches = items
    .map((item, index) => ({ item, index }))
    .filter((entry) => String(entry.item.category || "").toLowerCase() === normalizedCategory);
  const container = document.querySelector(`[data-category-results="${type}"]`) || document.querySelector(`[data-featured-list="${type}"]`);

  if (!container) return;

  const title = document.querySelector("#featured-hotel-title");
  const intro = title?.nextElementSibling;
  const label = category || "Hotel";

  if (title) title.textContent = `${label} hotel guide`;
  if (intro) {
    const countText = matches.length === 1 ? "1 hotel" : `${matches.length} hotels`;
    intro.textContent = matches.length
      ? `Showing ${countText} in the ${label.toLowerCase()} category. Click any gallery or details button for visitor-ready notes.`
      : `No hotels are listed under ${label.toLowerCase()} yet.`;
  }

  container.innerHTML = matches.length
    ? `<div class="category-result-stack">${matches.map((entry) => renderFeaturedCard(entry.item, `featured-hotel-details-${type}-${entry.index}`)).join("")}</div>`
    : `<div class="empty-category-result">No ${escapeHtml(label.toLowerCase())} hotels yet.</div>`;

  updateActiveCategoryButton(type, category);

  if (shouldScroll) {
    document.querySelector("#hotel-guide")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function updateActiveCategoryButton(type, category) {
  const normalizedCategory = String(category || "").toLowerCase();
  document.querySelectorAll(`[data-category-controls="${type}"] [data-category-filter]`).forEach((button) => {
    const isActive = String(button.dataset.categoryFilter || "").toLowerCase() === normalizedCategory;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  updateCategoryNote(type, category);
}

function updateCategoryNote(type, category) {
  const note = document.querySelector(`[data-category-note="${type}"]`);
  const noteText = categoryNotes[type]?.[category];

  if (note && noteText) {
    note.textContent = noteText;
  }
}

function renderCard(item, index = 0, type = "hotels") {
  const imageMarkup = item.image
    ? `<img src="${escapeAttribute(item.image)}" alt="${escapeAttribute(item.title)}">`
    : escapeHtml(item.category || "Listing");
  const canOpenGuide = Array.isArray(item.gallery) && item.gallery.length;
  const linkHref = canOpenGuide ? "#hotel-guide" : (item.url || "#");
  const guideAttributes = canOpenGuide ? ` data-guide-type="${escapeAttribute(type)}" data-guide-index="${index}"` : "";
  const developmentAttributes = isDevelopmentLocked
    ? ` aria-disabled="true" data-disabled-label="Temporarily unavailable"`
    : "";

  return `
    <a class="listing-card listing-card-link-wrap" href="${escapeAttribute(linkHref)}"${guideAttributes}${developmentAttributes}>
      <div class="listing-body">
        <span class="meta">${escapeHtml(item.category || "Listing")}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <span class="card-link">${escapeHtml(item.label || "View details")}</span>
      </div>
      <div class="listing-image${item.image ? " has-photo" : ""}">${imageMarkup}</div>
    </a>
  `;
}

function renderFeaturedCard(item, detailId = "featured-hotel-details") {
  const facts = Array.isArray(item.facts)
    ? item.facts.filter((fact) => !["amenities", "address"].includes(String(fact.label || "").toLowerCase()))
    : [];
  const amenities = Array.isArray(item.amenities) ? item.amenities : [];
  const details = Array.isArray(item.details) ? item.details : [];
  const gallery = (Array.isArray(item.gallery) && item.gallery.length ? item.gallery : [
    { src: item.image || "assets/images/hotel-pool-room.png", alt: `${item.title} photo` }
  ]).slice(0, 5);
  const highlights = Array.isArray(item.highlights) ? item.highlights : [];
  const facilities = Array.isArray(item.facilities) ? item.facilities : [];
  const gettingThere = item.gettingThere && Array.isArray(item.gettingThere.routes) ? item.gettingThere : buildGettingThere(item);
  const image = item.image || "assets/images/hotel-pool-room.png";
  const mainPhoto = gallery[0];
  const thumbnails = gallery;
  const galleryAmenities = facilities.length ? facilities.slice(0, 8) : amenities;
  const hasOfficialWebsite = item.url && item.url !== "#" && item.url !== item.facebookUrl;

  return `
    <article class="featured-hotel-card">
      <div class="featured-hotel-gallery">
        <div class="gallery-main">
          <img src="${escapeAttribute(mainPhoto.src || image)}" alt="${escapeAttribute(mainPhoto.alt || `${item.title} photo`)}">
        </div>
        <div class="gallery-thumbs">
          ${thumbnails.map((photo, index) => `
            <button class="gallery-thumb${index === 0 ? " is-active" : ""}" type="button" data-src="${escapeAttribute(photo.src)}" data-alt="${escapeAttribute(photo.alt || `${item.title} photo ${index + 1}`)}" aria-selected="${index === 0 ? "true" : "false"}">
              <img src="${escapeAttribute(photo.src)}" alt="${escapeAttribute(photo.alt || `${item.title} photo ${index + 1}`)}">
            </button>
          `).join("")}
        </div>
        <div class="gallery-info-panel">
          ${galleryAmenities.length ? `
            <section class="gallery-amenities">
              <h4>Amenities</h4>
              <ul>
                ${galleryAmenities.map((amenity) => `<li>${escapeHtml(amenity)}</li>`).join("")}
              </ul>
            </section>
          ` : ""}
          <div class="gallery-actions">
            <a class="hotel-icon-link details-link" href="#${escapeAttribute(detailId)}" aria-expanded="false">
              <span aria-hidden="true">i</span>
              <strong>More details</strong>
            </a>
            ${hasOfficialWebsite ? `
              <a class="hotel-icon-link website-link" href="${escapeAttribute(item.url)}" target="_blank" rel="noopener" aria-label="${escapeAttribute(item.title)} official website">
                <span class="icon-globe" aria-hidden="true"></span>
                <strong>Official website</strong>
              </a>
            ` : ""}
            ${item.phone ? `<a class="hotel-icon-link contact-link" href="tel:${escapeAttribute(formatPhoneHref(item.phone))}" aria-label="Call ${escapeAttribute(item.title)} at ${escapeAttribute(item.phone)}"><span class="icon-mobile" aria-hidden="true"></span><strong>${escapeHtml(item.phone)}</strong></a>` : ""}
            ${item.facebookUrl ? `<a class="hotel-icon-link facebook-link" href="${escapeAttribute(item.facebookUrl)}" target="_blank" rel="noopener" aria-label="${escapeAttribute(item.title)} Facebook page"><span aria-hidden="true">f</span><strong>Facebook</strong></a>` : ""}
          </div>
        </div>
      </div>
      <div class="featured-hotel-body">
        <div class="featured-hotel-topline">
          <span class="meta">${escapeHtml(item.guideLabel || item.category || "Hotel guide")}</span>
          <span class="hotel-score">${escapeHtml(item.score || "Business")}${item.scoreText ? ` <small>${escapeHtml(item.scoreText)}</small>` : ""}</span>
        </div>
        ${item.logo ? `
          <h3 class="hotel-logo-title">
            <img src="${escapeAttribute(item.logo)}" alt="${escapeAttribute(item.title)}">
          </h3>
        ` : `<h3>${escapeHtml(item.title)}</h3>`}
        ${item.location ? `<p class="hotel-location">${escapeHtml(item.location)}</p>` : ""}
        <p>${escapeHtml(item.description)}</p>
        ${facts.length ? `
          <dl class="hotel-facts">
            ${facts.map((fact) => `
              <div>
                <dt>${escapeHtml(fact.label)}</dt>
                <dd>${escapeHtml(fact.value)}</dd>
              </div>
            `).join("")}
          </dl>
        ` : ""}
        <aside class="hotel-disclaimer" aria-label="Listing disclaimer">
          <strong>Independent local guide</strong>
          <p>VisitGensan.com is an independent local guide and is not affiliated with the hotels listed unless clearly stated. Rates, amenities, availability, and contact details may change, so please confirm directly with the hotel or visit its official channels for the latest information.</p>
        </aside>
      </div>
      <div class="hotel-detail-panel" id="${escapeAttribute(detailId)}" hidden>
        <div class="detail-copy">
          <h4>Why it is in this guide</h4>
          ${details.map((detail) => `<p>${escapeHtml(detail)}</p>`).join("")}
        </div>
        ${highlights.length ? `
          <div class="property-highlights">
            <h4>Property highlights</h4>
            <div class="highlight-grid">
              ${highlights.map((highlight) => `
                <article>
                  <strong>${escapeHtml(highlight.title)}</strong>
                  <p>${escapeHtml(highlight.text)}</p>
                </article>
              `).join("")}
            </div>
          </div>
        ` : ""}
        ${facilities.length ? `
          <div class="popular-facilities">
            <h4>Most popular facilities</h4>
            <ul>
              ${facilities.map((facility) => `<li>${escapeHtml(facility)}</li>`).join("")}
            </ul>
          </div>
        ` : ""}
        ${gettingThere ? `
          <div class="getting-there-guide">
            <h4>${escapeHtml(gettingThere.title || "How to get there")}</h4>
            <div class="route-guide-grid">
              ${gettingThere.routes.map((route) => `
                <article class="${route.image?.src ? "has-route-image" : ""}">
                  <div class="route-copy">
                    <strong>${escapeHtml(route.title)}</strong>
                    ${(Array.isArray(route.paragraphs) ? route.paragraphs : []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
                    ${route.image?.src ? `
                      <figure class="route-photo">
                        <img src="${escapeAttribute(route.image.src)}" alt="${escapeAttribute(route.image.alt || route.title)}">
                      </figure>
                    ` : ""}
                    ${route.link?.url ? `
                      <a class="route-external-link" href="${escapeAttribute(route.link.url)}" target="_blank" rel="noopener">
                        <span class="route-link-icon" aria-hidden="true">f</span>
                        <span>${escapeHtml(route.link.label || route.link.url)}</span>
                      </a>
                    ` : ""}
                    ${Array.isArray(route.contacts) && route.contacts.length ? `
                      <dl class="route-contact-list">
                        ${route.contacts.map((contact) => `
                          <div>
                            <span class="route-contact-icon ${escapeAttribute(routeContactIcon(contact.label))}" aria-hidden="true"></span>
                            <dt>${escapeHtml(contact.label)}</dt>
                            <dd>${escapeHtml(contact.value)}</dd>
                          </div>
                        `).join("")}
                      </dl>
                    ` : ""}
                    ${route.suggestedMessage ? `
                      <div class="suggested-message">
                        <h5>Suggested message</h5>
                        <p>${escapeHtml(route.suggestedMessage)}</p>
                      </div>
                    ` : ""}
                    ${route.map?.embedUrl ? `
                      <div class="route-map">
                        <iframe src="${escapeAttribute(route.map.embedUrl)}" title="${escapeAttribute(route.map.title || `${item.title} map`)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
                        ${route.map.url ? `
                          <a class="map-link" href="${escapeAttribute(route.map.url)}" target="_blank" rel="noopener">
                            <span class="map-link-icon" aria-hidden="true"></span>
                            <span>${escapeHtml(route.map.label || "Open in Google Maps")}</span>
                          </a>
                        ` : ""}
                      </div>
                    ` : ""}
                  </div>
                </article>
              `).join("")}
            </div>
            ${gettingThere.note ? `<p class="travel-note"><strong>Local travel note</strong> ${escapeHtml(gettingThere.note)}</p>` : ""}
          </div>
        ` : ""}
      </div>
    </article>
  `;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function formatPhoneHref(value = "") {
  return String(value).replace(/[^\d+]/g, "");
}

function buildLocationMap(item) {
  const query = [item.title, item.location].filter(Boolean).join(", ");
  const encodedQuery = encodeURIComponent(query);

  return {
    label: "Open in Google Maps",
    title: `${item.title} map`,
    url: `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`,
    embedUrl: `https://www.google.com/maps?q=${encodedQuery}&output=embed`
  };
}

function buildGettingThere(item) {
  if (!item?.title || !item?.location) return null;

  const map = buildLocationMap(item);

  return {
    title: "How to get there",
    routes: [
      {
        title: "From Bulaong Bus Terminal",
        image: {
          src: "assets/images/gensantricycle.png",
          alt: "Blue General Santos City tricycle"
        },
        paragraphs: [
          `If you are coming from Bulaong Bus Terminal in General Santos City, you can ride a local tricycle with a yellow plate. Tell the driver to take you to ${item.title}.`,
          "For a direct pakyaw trip, the fare is usually around PHP 50 to PHP 100 depending on your agreement with the driver. For a regular or shared ride, the fare is usually around PHP 20. Please confirm the fare before starting the trip."
        ]
      },
      {
        title: "From General Santos Airport",
        paragraphs: [
          "If you are coming from General Santos Airport, the most convenient option is to take a taxi or book a ride in advance.",
          "You may contact Gensan City Taxi through its Facebook page, or call or text the numbers below before traveling."
        ],
        link: {
          label: "Gensan City Taxi Facebook page",
          url: "https://www.facebook.com/profile.php?id=100063770273399"
        },
        contacts: [
          {
            label: "Smart",
            value: "0950 260 6057"
          },
          {
            label: "TM",
            value: "0935 025 5176"
          },
          {
            label: "Landline",
            value: "(083) 552 1164"
          }
        ],
        suggestedMessage: `Hello, I need a taxi going to ${item.title}. May I know if a unit is available and the estimated fare?`,
        map
      }
    ],
    note: "Fares, availability, and contact details may change, so please confirm directly with the driver or taxi operator before traveling."
  };
}

function routeContactIcon(label = "") {
  const normalizedLabel = String(label).toLowerCase();
  if (normalizedLabel.includes("landline")) return "icon-landline";
  return "icon-mobile";
}

(function initSlowScrollReveal() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    return;
  }

  const revealSelector = [
    '.about-gensan-copy h2',
    '.about-gensan-copy p',
    '.about-polaroid',
    '.about-tuna-seal',
    '.about-side-champions',
    '.section-heading',
    '.feature-card',
    '.card-grid > *',
    '.muted-band',
    '.split-section'
  ].join(', ');

  const revealItems = Array.from(document.querySelectorAll(revealSelector));

  if (!revealItems.length) {
    return;
  }

  revealItems.forEach((item, index) => {
    item.classList.add('scroll-reveal');
    item.style.setProperty('--reveal-delay', `${Math.min(index * 90, 540)}ms`);
  });

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    },
    {
      threshold: 0.16,
      rootMargin: '0px 0px -8% 0px'
    }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
})();
