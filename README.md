# LabelDesk

Desktop-first label designer for Niimbot thermal printers. Design a label on canvas, connect over Bluetooth, print.

## Development

```
npm install
npm run dev
```

Open http://localhost:5180 in Chrome or Edge (Web Bluetooth required).

- `npm run check` - svelte-check
- `npm test` - unit tests
- `npm run build` - production build

## CSV batch printing

Open **Data** in the top bar to import or edit comma-separated data. The first row defines placeholder names:

```csv
name,sku,$times
Widget A,ABC-001,2
Widget B,ABC-002,1
```

Use `{name}` or `{sku}` in text, QR code, and barcode values. `$times` sets the quantity for that row and is multiplied by the Copies value in the print dialog. The print preview can navigate source rows and print all rows or an inclusive range.

Saved and exported labels omit CSV data by default. Enable **Include batch data** in the Library dialog when the data should travel with the template.
