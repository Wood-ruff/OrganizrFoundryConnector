const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Base for resizable windows that show the JSON of one subject and re-render when it changes.
 * Subclasses define the subject, its snapshot, which hooks matter and whether a changed document concerns it.
 */
export class LiveJsonWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["organizr-inspector"],
    window: { title: "ORGANIZR.Inspector.Title", resizable: true },
    position: { width: 620, height: 720 },
    actions: {
      copyJson: LiveJsonWindow.#onCopyJson
    }
  };

  static PARTS = {
    body: { template: "modules/organizr-foundry-connector/templates/json-window.hbs" }
  };

  static LIVE_HOOKS = [];

  static #open = new Map();

  #hookIds = [];

  /** Opens a window of the given class once per id; a second call focuses the existing one. */
  static show(WindowClass, options) {
    const existing = LiveJsonWindow.#open.get(options.id);
    if (existing) return existing.render({ force: true });
    const window = new WindowClass(options);
    LiveJsonWindow.#open.set(options.id, window);
    return window.render({ force: true });
  }

  /** The live document this window shows, or null when it is gone. */
  _subject() {
    return null;
  }

  /** Plain JSON-safe data for the subject. */
  _snapshot(subject) {
    return subject;
  }

  /** Whether a changed document affects the shown subject. */
  _concerns(changed, subject) {
    return changed === subject;
  }

  _subjectTitle(subject) {
    return subject?.name ?? "?";
  }

  get title() {
    const base = game.i18n.localize(this.options.window.title);
    return `${base}: ${this._subjectTitle(this._subject())}`;
  }

  json() {
    const subject = this._subject();
    if (!subject) return "";
    return JSON.stringify(this._snapshot(subject), null, 2);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const subject = this._subject();
    context.missing = subject === null;
    context.json = this.json();
    return context;
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    for (const hook of this.constructor.LIVE_HOOKS) {
      this.#hookIds.push([hook, Hooks.on(hook, (document) => this.#onDocumentChange(document))]);
    }
  }

  _onClose(options) {
    super._onClose(options);
    for (const [hook, id] of this.#hookIds) Hooks.off(hook, id);
    this.#hookIds = [];
    LiveJsonWindow.#open.delete(this.id);
  }

  #onDocumentChange(document) {
    const subject = this._subject();
    if (subject === null || this._concerns(document, subject)) this.render();
  }

  static async #onCopyJson() {
    const json = this.json();
    if (!json) return;
    await game.clipboard.copyPlainText(json);
    ui.notifications.info(game.i18n.localize("ORGANIZR.Inspector.Copied"));
  }
}
