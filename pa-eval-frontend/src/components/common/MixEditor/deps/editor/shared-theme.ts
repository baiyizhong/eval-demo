import { type CreateThemeOptions } from "@uiw/codemirror-themes";
import { tags as t } from "@lezer/highlight";

export const defaultSettingsBothThemes: CreateThemeOptions["settings"] = {
  background: "var(--background)",
  foreground: "var(--foreground)",
  caret: "var(--foreground)",
  gutterBackground: "var(--sidebar)",
  gutterForeground: "var(--sidebar-foreground)",
  gutterBorder: "var(--sidebar-border)",
  gutterActiveForeground: "var(--sidebar-primary)",
  selection: "var(--accent)",
  selectionMatch: "var(--muted)",
  lineHighlight: "var(--muted)",
};

export const bothThemeStyles: CreateThemeOptions["styles"] = [
  { tag: t.invalid, color: "hsl(var(--dark-red))" },
  {
    tag: [
      t.name,
      t.deleted,
      t.character,
      t.macroName,
      t.propertyName,
      t.variableName,
      t.labelName,
      t.definition(t.name),
    ],
    color: "hsl(var(--primary-accent))",
  },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.link, textDecoration: "underline" },
];
