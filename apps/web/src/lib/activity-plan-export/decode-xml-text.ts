/** Decode one XML entity layer from pdftotext output, never the replacement text. */
export function decodeXmlText(value: string): string {
  return value.replace(
    /&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/giu,
    (entity: string, code: string) => {
      if (code.startsWith("#")) {
        const hexadecimal = code[1]?.toLowerCase() === "x";
        return String.fromCodePoint(
          Number.parseInt(code.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10),
        );
      }
      switch (code) {
        case "amp":
          return "&";
        case "lt":
          return "<";
        case "gt":
          return ">";
        case "quot":
          return '"';
        case "apos":
          return "'";
        default:
          return entity;
      }
    },
  );
}
