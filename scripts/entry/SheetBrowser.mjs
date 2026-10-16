import { filterSheets, groupSheets, listErrorKey } from "../service/SheetCatalog.mjs";
import { createImageCache } from "../service/ImageCache.mjs";
import { readWorldLink } from "../config/ModuleSettings.mjs";
import { createOrganizrClient } from "../client/OrganizrClient.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const SEARCH_DELAY_MS = 150;

const organizr = createOrganizrClient();

/** Window listing the Organizr sheets the linked token can read, grouped by project and type, with search and lazily streamed portraits. */
export class SheetBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "organizr-sheet-browser",
    classes: ["organizr-sheet-browser"],
    window: { title: "ORGANIZR.Browser.Title", icon: "fa-solid fa-cloud-arrow-down", resizable: true },
    position: { width: 720, height: 640 },
    actions: {
      reloadSheets: SheetBrowser.#onReload
    }
  };

  static PARTS = {
    toolbar: { template: "modules/organizr-foundry-connector/templates/sheet-browser-toolbar.hbs" },
    list: { template: "modules/organizr-foundry-connector/templates/sheet-browser-list.hbs" }
  };

  static #instance = null;

  #entries = null;
  #errorKey = null;
  #loading = false;
  #term = "";
  #searchTimer = null;
  #observer = null;
  #images = createImageCache({
    load: (fileId) => organizr.fetchFileBlob(readWorldLink(), fileId),
    createUrl: (blob) => URL.createObjectURL(blob),
    revokeUrl: (url) => URL.revokeObjectURL(url)
  });

  /** Opens the single browser window, or brings the open one to the front. */
  static show() {
    if (!SheetBrowser.#instance) SheetBrowser.#instance = new SheetBrowser();
    return SheetBrowser.#instance.render({ force: true });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.term = this.#term;
    context.loading = this.#loading;
    context.errorKey = this.#errorKey;
    context.loaded = this.#entries !== null;
    context.total = this.#entries?.length ?? 0;
    context.projects = this.#projects();
    return context;
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.#load();
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const parts = options.parts ?? Object.keys(this.constructor.PARTS);
    if (parts.includes("toolbar")) this.#wireSearch();
    if (parts.includes("list")) this.#observeImages();
  }

  _onClose(options) {
    super._onClose(options);
    this.#observer?.disconnect();
    this.#images.release();
    clearTimeout(this.#searchTimer);
    SheetBrowser.#instance = null;
  }

  #projects() {
    const projects = groupSheets(filterSheets(this.#entries, this.#term));
    for (const project of projects) {
      for (const type of project.types) type.sheets.forEach((sheet) => this.#decorate(sheet));
    }
    return projects;
  }

  #decorate(sheet) {
    sheet.imageUrl = sheet.imageFileId ? this.#images.cached(sheet.imageFileId) : null;
    sheet.inWorld = Boolean(sheet.worldActorId && game.actors.get(sheet.worldActorId));
  }

  async #load() {
    this.#loading = true;
    this.#errorKey = null;
    this.render({ parts: ["list"] });
    try {
      this.#entries = await organizr.listSheets(readWorldLink());
    } catch (error) {
      this.#entries = null;
      this.#errorKey = listErrorKey(error.status ?? -1);
    } finally {
      this.#loading = false;
      this.render({ parts: ["list"] });
    }
  }

  #wireSearch() {
    const input = this.element.querySelector("input[name=search]");
    input?.addEventListener("input", () => {
      this.#term = input.value;
      clearTimeout(this.#searchTimer);
      this.#searchTimer = setTimeout(() => this.render({ parts: ["list"] }), SEARCH_DELAY_MS);
    });
  }

  #observeImages() {
    this.#observer?.disconnect();
    const root = this.element.querySelector(".organizr-sheet-list");
    if (!root) return;
    this.#observer = new IntersectionObserver((hits) => this.#onImagesVisible(hits), { root, rootMargin: "100px" });
    for (const img of root.querySelectorAll("img[data-file-id]:not([src])")) this.#observer.observe(img);
  }

  #onImagesVisible(hits) {
    for (const hit of hits) {
      if (!hit.isIntersecting) continue;
      this.#observer.unobserve(hit.target);
      this.#showImage(hit.target);
    }
  }

  async #showImage(img) {
    const url = await this.#images.urlFor(img.dataset.fileId);
    if (url) img.src = url;
    else img.classList.add("failed");
  }

  static #onReload() {
    if (this.#loading) return;
    this.#load();
  }
}
