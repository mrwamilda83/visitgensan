# VisitGensan Static MVP

This is the first static version of `VisitGensan.com` for testing on a Hostinger subdomain such as:

```txt
visitgensan.wamiltech.com
```

## Pages

- `index.html`
- `hotels.html`
- `things-to-do.html`
- `food-restaurants.html`
- `travel-guides.html`

## How to edit listings

Edit the JSON files inside `data/`:

- `data/hotels.json`
- `data/restaurants.json`
- `data/activities.json`
- `data/guides.json`

Each item uses this shape:

```json
{
  "title": "Listing title",
  "category": "Listing category",
  "description": "Short description.",
  "label": "Button label",
  "url": "#"
}
```

## Upload to Hostinger

Upload the contents of this folder to the document root for the subdomain. The file `index.html` should sit at the root of the subdomain folder.

## Before public launch

- Replace sample listing names with verified businesses.
- Use your own photos or photos you have permission to use.
- Add real Google Maps links and contact details.
- Keep paid placements clearly labeled as Sponsored, Featured Partner, or Paid Placement.
