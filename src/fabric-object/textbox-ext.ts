import * as fabric from "fabric";
import { findLargestFittingFontSize, MIN_FITTED_FONT_SIZE } from "$/utils/text_fit";

interface UniqueTextboxExtProps {
  fontAutoSize: boolean;
}

const TEXTBOX_PROPS: Array<keyof UniqueTextboxExtProps> = ["fontAutoSize"];

export const textboxExtDefaultValues: Partial<fabric.TClassProperties<TextboxExt>> = {
  fontAutoSize: false,
};

export interface TextboxExtProps extends fabric.TextboxProps, UniqueTextboxExtProps {}
export interface SerializedTextboxExtProps extends fabric.SerializedTextboxProps, UniqueTextboxExtProps {}

export class TextboxExt<
    Props extends fabric.TOptions<TextboxExtProps> = Partial<TextboxExtProps>,
    SProps extends SerializedTextboxExtProps = SerializedTextboxExtProps,
    EventSpec extends fabric.ITextEvents = fabric.ITextEvents,
  >
  extends fabric.Textbox<Props, SProps, EventSpec>
  implements UniqueTextboxExtProps
{
  declare fontAutoSize: boolean;

  private widthBeforeEditing?: number;

  constructor(text: string, options?: Props) {
    super(text, options);
    Object.assign(this, textboxExtDefaultValues);
    this.setOptions(options);

    this.setControlsVisibility({
      mb: false,
      mt: false,
    });
  }

  /** Set text and reduce fontSize until text fits to the given width */
  setAndShrinkText(text: string, maxWidth: number, maxLines?: number) {
    const linesLimit = maxLines ?? this._splitTextIntoLines(this.text).lines.length;

    let linesCount = this._splitTextIntoLines(text).lines.length;

    this.set({ text });

    while ((linesCount > linesLimit || this.width > maxWidth) && this.fontSize > 2) {
      this.fontSize -= 1;
      this.set({ text, width: maxWidth });
      linesCount = this._splitTextIntoLines(text).lines.length;
    }
  }

  /** Reduce fontSize until text fits to the given width */
  shrinkText(maxWidth: number, maxLines: number) {
    let linesCount = this._splitTextIntoLines(this.text).lines.length;

    while ((linesCount > maxLines || this.width > maxWidth) && this.fontSize > 2) {
      this.fontSize -= 1;
      this.set({ width: maxWidth });
      linesCount = this._splitTextIntoLines(this.text).lines.length;
    }
  }

  /** Resize the font and text box to occupy the largest safe area inside the given bounds. */
  fitFontToBounds(maxWidth: number, maxHeight: number): number {
    const targetWidth = Math.max(maxWidth, this.minWidth);
    const targetHeight = Math.max(maxHeight, MIN_FITTED_FONT_SIZE);
    const contentWidth = Math.max(this.minWidth, targetWidth - this.strokeWidth);
    const maxFontSize = Math.max(
      MIN_FITTED_FONT_SIZE,
      Math.ceil(Math.max(targetWidth, targetHeight) * 2),
    );

    const applySize = (fontSize: number) => {
      this.set({
        fontSize,
        width: contentWidth,
        scaleX: 1,
        scaleY: 1,
      });
      this.setCoords();
    };

    const best = findLargestFittingFontSize((fontSize) => {
      applySize(fontSize);
      return this.getScaledWidth() <= targetWidth + 0.01 && this.getScaledHeight() <= targetHeight + 0.01;
    }, MIN_FITTED_FONT_SIZE, maxFontSize);

    applySize(best);
    return best;
  }

  override enterEditingImpl() {
    super.enterEditingImpl();
    this.widthBeforeEditing = this.width;
  }

  override exitEditingImpl() {
    super.exitEditingImpl();
    this.widthBeforeEditing = undefined;
  }

  override updateFromTextArea(): void {
    super.updateFromTextArea();

    if (this.widthBeforeEditing !== undefined && this.fontAutoSize) {
      const lines = this.text.split("\n").length;
      this.shrinkText(this.widthBeforeEditing, lines);
    }
  }

  override toObject<T extends Omit<Props & fabric.TClassProperties<this>, keyof SProps>, K extends keyof T = never>(
    propertiesToInclude: K[] = [],
  ): Pick<T, K> & SProps {
    return super.toObject([...propertiesToInclude, ...TEXTBOX_PROPS] as (keyof T)[]);
  }
}
