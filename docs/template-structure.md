# ProductCenter – Template Structure

## Overview

Templates define the **schema** for product data files. A template describes which fields a product can have, their types, constraints, labels, and default values. The server uses templates to generate empty product YAML files pre-filled with defaults, and the frontend uses them to render dynamic editing forms.

Templates live in the `templates/` directory as `.yaml` files. Product data files live in `products/`.

---

## Top-Level Structure

A template file has three top-level keys:

```yaml
_template:
  name: "Ethernet Switch"
  description: "Template für managed/unmanaged Ethernet Switches"
  version: 1
  category: "Ethernet Switches"
  author: "bauerlogic"
  date: "2026-03-14"
  status: "active"
  language: "de"

meta:
  # ... document-level metadata schema (author, version, date, status, template)

product:
  # ... field definitions ...
```

### `_template` (Template Metadata)

The `_template` block lives **only** in template files. It describes the template itself and is **not** included in product data.

| Key           | Type   | Description                                                      |
|---------------|--------|------------------------------------------------------------------|
| `name`        | string | Human-readable template name                                     |
| `description` | string | Short description of the template                                |
| `version`     | number | Template version (for future migrations)                         |
| `category`    | string | Broad product category                                           |
| `author`      | string | Author or maintainer of the template                             |
| `date`        | string | Creation or last-modified date (ISO 8601, e.g. `"2026-03-14"`)   |
| `status`      | string | Template lifecycle status (`draft`, `active`, `deprecated`)      |
| `language`    | string | Primary language of labels and placeholders (e.g. `"de"`, `"en"`)|

### `meta` (Product Document Metadata)

`meta` is a **top-level key** in both template and product files — a sibling of `product`, not nested inside it. In template files it contains field definitions (with `_type`); in product files it contains the actual values.

| Key        | Type   | Description                                                       |
|------------|--------|-------------------------------------------------------------------|
| `author`   | string | Person who created or last edited this product document            |
| `version`  | string | Document version (e.g. `"1.0"`)                                   |
| `date`     | date   | Creation or last-modified date                                    |
| `status`   | enum   | Document lifecycle: `draft`, `review`, `released`, `archived`     |
| `template` | string | Filename of the template this product was created from            |

> **Note:** `meta.status` (document lifecycle) is separate from `product.status` (product lifecycle: planned, in development, in production, etc.).

Example in a product file:

```yaml
meta:
  author: "Max Mustermann"
  version: "1.0"
  date: "2025-06-01"
  status: "released"
  template: "ethernet-switch.yaml"

product:
  id: "ES-2408G"
  name: "Industrial Ethernet Switch 24-Port Gigabit"
  # ...
```

### `product` (Field Schema)

The `product` key contains the full field hierarchy. Each key is either a **field definition** (leaf node with `_type`) or a **section** (nested object grouping related fields).

---

## Field Definitions

A field is identified by the presence of a `_type` property. All field-level properties start with `_` (underscore) to distinguish schema metadata from actual data keys.

### Supported Field Types

| `_type`        | Description                                      | Default when empty |
|----------------|--------------------------------------------------|--------------------|
| `string`       | Free text                                        | `""`               |
| `number`       | Numeric value (integer or float)                 | `null`             |
| `boolean`      | True / false                                     | `false`            |
| `enum`         | Single selection from a fixed list (`_options`)   | `""`               |
| `date`         | Date string (e.g. `"2025-06-01"`)               | `""`               |
| `array`        | List of structured objects (schema in `_item`)   | `[]`               |
| `string-array` | List of plain strings                            | `[]`               |

### Common Field Properties

| Property       | Type            | Required | Description                                                  |
|----------------|-----------------|----------|--------------------------------------------------------------|
| `_type`        | string          | **yes**  | Data type (see table above)                                  |
| `_label`       | string          | no       | Display label for the UI                                     |
| `_required`    | boolean         | no       | Whether the field must be filled (`true` / `false`)          |
| `_default`     | any             | no       | Default value when creating a new product from the template  |
| `_placeholder` | string          | no       | Placeholder / hint text shown in the input field             |
| `_unit`        | string          | no       | Unit of measurement displayed next to the value (e.g. `"W"`, `"mm"`) |

### Type-Specific Properties

#### `number`

| Property | Type   | Description              |
|----------|--------|--------------------------|
| `_min`   | number | Minimum allowed value    |
| `_max`   | number | Maximum allowed value    |

#### `string`

| Property   | Type   | Description                                     |
|------------|--------|-------------------------------------------------|
| `_pattern` | string | Regex pattern for validation (e.g. EAN-13 check) |

#### `enum`

| Property   | Type     | Description              |
|------------|----------|--------------------------|
| `_options` | string[] | List of allowed values   |

#### `string-array`

| Property       | Type     | Description                                  |
|----------------|----------|----------------------------------------------|
| `_suggestions` | string[] | Predefined values the user can pick from     |

#### `array` (Structured Lists)

| Property | Type   | Description                                         |
|----------|--------|-----------------------------------------------------|
| `_item`  | object | Schema definition for each element in the array     |

Each key inside `_item` is itself a full field definition (with `_type`, `_label`, etc.).

### Conditional Visibility

Fields can be conditionally shown/hidden based on another field's value:

```yaml
poe_standard:
  _type: enum
  _options:
    - "IEEE 802.3af (PoE)"
    - "IEEE 802.3at (PoE+)"
    - "IEEE 802.3bt (PoE++)"
  _label: "PoE-Standard"
  _visible_if:
    field: poe
    value: true
```

| Property              | Type   | Description                        |
|-----------------------|--------|------------------------------------|
| `_visible_if.field`   | string | Sibling field name to watch        |
| `_visible_if.value`   | any    | Value that triggers visibility     |

---

## Sections (Grouping)

Any key under `product` that does **not** have a `_type` is a **section** – a logical grouping of fields. Sections can carry a `_label` for the UI:

```yaml
general:
  _label: "Allgemein"
  product_type:
    _type: string
    _label: "Produkttyp"
  series:
    _type: string
    _label: "Serie"
```

Sections can be nested (e.g. `physical.dimensions_mm` contains `width`, `height`, `depth`).

---

## How Defaults Are Extracted

The server function `extractDefaults()` in [server.js](../server.js) recursively walks the template schema and builds a plain data object:

| Schema type    | Generated default                       |
|----------------|-----------------------------------------|
| `_type: string` / `enum` / `date` | `_default` value or `""` |
| `_type: number`   | `_default` value or `null`          |
| `_type: boolean`  | `_default` value or `false`         |
| `_type: array` / `string-array` | `[]`                   |
| Section (no `_type`) | Recurse into child keys           |
| Keys starting with `_` | Skipped (metadata only)          |

---

## Template → Product: Full Example

### Template (schema)

```yaml
ports:
  _type: array
  _label: "Ports"
  _item:
    type:
      _type: enum
      _options: [RJ45, SFP, "SFP+"]
      _required: true
      _label: "Port-Typ"
    count:
      _type: number
      _min: 1
      _required: true
      _label: "Anzahl"
    poe:
      _type: boolean
      _default: false
      _label: "PoE"
```

### Product data (filled in)

```yaml
ports:
  - type: "RJ45"
    count: 24
    poe: true
  - type: "SFP+"
    count: 4
    poe: false
```

---

## API Endpoints

| Method | Endpoint                       | Description                                      |
|--------|--------------------------------|--------------------------------------------------|
| GET    | `/api/templates`               | List all templates (name, description, category)  |
| GET    | `/api/templates/:filename`     | Get full schema + extracted defaults              |
| POST   | `/api/products`                | Create a new product (optionally from defaults)   |

---

## Creating a New Template

1. Create a `.yaml` file in the `templates/` directory.
2. Add a `_template` metadata block with `name`, `description`, `version`, `category`, `author`, `date`, `status`, and `language`.
3. Define the `product` key starting with a `meta` section, followed by field definitions using the `_type` convention.
4. Restart the server – the template will appear in the `/api/templates` listing.

### Naming Convention

- Use kebab-case for the filename: `ethernet-switch.yaml`
- Use snake_case for field keys: `mac_address_table`, `operating_temperature_c`
- Prefix all schema metadata with `_`: `_type`, `_label`, `_required`, etc.

---

## Complete Field Types Reference

```
meta/                           [top-level section]
├── author                      (string)
├── version                     (string, default: "1.0")
├── date                        (date)
├── status                      (enum: draft|review|released|archived)
└── template                    (string)

product
├── id                          (string, required)
├── name                        (string, required)
├── category                    (string, default)
├── manufacturer                (string, required)
├── status                      (enum: draft|active|discontinued)
├── general/                    [section]
│   ├── product_type            (string, default)
│   ├── series                  (string)
│   ├── part_number             (string, required)
│   ├── ean                     (string, pattern)
│   ├── release_date            (date)
│   └── warranty_years          (number, 0–10, unit: Jahre)
├── ports                       (array of objects)
│   └── _item/
│       ├── type                (enum, required)
│       ├── count               (number, min: 1, required)
│       ├── speed               (string)
│       ├── poe                 (boolean)
│       ├── poe_standard        (enum, visible_if: poe=true)
│       └── max_poe_power_per_port_w (number, visible_if: poe=true)
├── network/                    [section]
│   ├── switching_capacity_gbps (number, unit: Gbps)
│   ├── forwarding_rate_mpps    (number, unit: Mpps)
│   ├── mac_address_table       (number)
│   ├── jumbo_frame_bytes       (number, unit: Bytes)
│   ├── vlan_ids                (number, max: 4094)
│   └── protocols               (string-array, suggestions)
├── management/                 [section]
│   ├── interfaces              (string-array, suggestions)
│   ├── protocols               (string-array, suggestions)
│   └── firmware_update         (string)
├── security/                   [section]
│   ├── features                (string-array, suggestions)
│   └── encryption              (string)
├── power/                      [section]
│   ├── input_voltage           (string)
│   ├── redundant_power         (boolean)
│   ├── max_power_consumption_w (number, unit: W)
│   └── total_poe_budget_w      (number, unit: W)
├── physical/                   [section]
│   ├── dimensions_mm/          [subsection]
│   │   ├── width               (number, unit: mm)
│   │   ├── height              (number, unit: mm)
│   │   └── depth               (number, unit: mm)
│   ├── weight_kg               (number, unit: kg)
│   ├── mounting                (string)
│   ├── material                (string)
│   └── protection_class        (enum: IP20–IP67)
├── environmental/              [section]
│   ├── operating_temperature_c/ [subsection]
│   │   ├── min                 (number, unit: °C)
│   │   └── max                 (number, unit: °C)
│   ├── storage_temperature_c/  [subsection]
│   │   ├── min                 (number, unit: °C)
│   │   └── max                 (number, unit: °C)
│   ├── humidity_percent/       [subsection]
│   │   ├── min                 (number, unit: %)
│   │   ├── max                 (number, unit: %)
│   │   └── condensing          (boolean)
│   ├── vibration               (string)
│   └── shock                   (string)
├── certifications              (string-array, suggestions)
└── documents                   (array of objects)
    └── _item/
        ├── type                (enum: datasheet|manual|firmware|certificate|drawing)
        ├── url                 (string)
        ├── language            (enum: de|en|fr|es|it, default: de)
        └── version             (string)
```
