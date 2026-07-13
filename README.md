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

## Recovery and exports

LabelDesk automatically saves the active canvas, label settings, document name, and enabled batch data in the browser. Reloading the application restores that working session. The document name shows an asterisk when it differs from the last library save, JSON export, or loaded template.

Use **Export PNG** in the Library dialog to save the current label as a one-pixel-per-dot image.

## Multi-object editing

Drag a selection rectangle around multiple objects or Shift-click them to create a multi-selection. The properties panel can align object edges and centers, distribute three or more objects with equal gaps, align a single object or complete selection to every label edge or center, change its stacking order, and group or ungroup objects.

When every selected object is text, the same panel can apply a font, size, weight, or text alignment to the complete selection. Mixed values are shown explicitly until a shared value is chosen.

For a single text object, **Fit text to 90%** finds the largest font size that fits within a safe 5% margin on every side of the label and centers the result.

## Keyboard shortcuts

- `Ctrl+C`, `Ctrl+X`, and `Ctrl+V` - copy, cut, and paste selected label objects
- `Ctrl+D` - duplicate the selection
- `Ctrl+A` - select every label object
- `Ctrl+G` and `Ctrl+Shift+G` - group and ungroup
- `Ctrl+Z`, `Ctrl+Shift+Z`, and `Ctrl+Y` - undo and redo
- Arrow keys - move by one dot; hold Shift to move by ten dots
- `Delete` or `Backspace` - delete the selection
- `Escape` - clear the selection

Canvas shortcuts remain inactive while editing text, typing in a form field, or using a dialog.

## Custom fonts

Open **Fonts** to import a local TTF, OTF, WOFF, or WOFF2 file. Custom fonts stay in this browser and become available in the single- and multi-text font selectors. Removing a font does not rewrite label objects; LabelDesk instead warns wherever the missing family would fall back, including in the print dialog.

Saved and exported labels omit font files by default. Enable **Include custom fonts** in the Library dialog to embed only the custom families used by the current canvas. Embedded fonts are installed before a portable template is rendered.
