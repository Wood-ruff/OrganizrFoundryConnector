import { batchPlan, filterSheets, groupSheets, importableSheets, listErrorKey } from "../service/SheetCatalog.mjs";
import { needsBatchConfirm } from "../service/RefreshPrompt.mjs";
import { importErrorKey } from "../service/SheetImport.mjs";
import { createImageCache } from "../service/ImageCache.mjs";
import { readWorldLink } from "../config/ModuleSettings.mjs";
import { createOrganizrClient } from "../client/OrganizrClient.mjs";
import { importSheet, linkedWorldDocuments } from "./SheetImport.mjs";
import { confirmBatch, confirmRefresh } from "./RefreshConfirm.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const SEARCH_DELAY_MS = 150;

const organizr = createOrganizrClient();

/** Window listing the Organizr sheets the linked token can read, grouped by project and type, with search, lazily streamed portraits and per-sheet import. */
export class SheetBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "organizr-sheet-browser",
    classes: ["organizr-sheet-browser"],
    window: { title: "ORGANIZR.Browser.Title", icon: "fa-solid fa-cloud-arrow-down", resizable: true },
    position: { width: 720, height: 640 },
    actions: {
      reloadSheets: SheetBrowser.#onReload,
      importSheet: SheetBrowser.#onImport,
      importSection: SheetBrowser.#onImportSection
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
  #importing = new Set();
  #batchRunning = false;
  #confirming = false;
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
    context.batchRunning = this.#batchRunning;
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
    const linked = linkedWorldDocuments();
    for (const project of projects) {
      for (const type of project.types) type.sheets.forEach((sheet) => this.#decorate(sheet, linked));
    }
    return projects;
  }

  #decorate(sheet, linked) {
    sheet.imageUrl = sheet.imageFileId ? this.#images.cached(sheet.imageFileId) : null;
    sheet.inWorld = linked.has(String(sheet.fileId)) || Boolean(sheet.worldActorId && game.actors.get(sheet.worldActorId));
    sheet.importing = this.#importing.has(String(sheet.fileId));
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

  async #import(fileId, options) {
    this.#importing.add(fileId);
    this.render({ parts: ["list"] });
    try {
      const outcome = await importSheet(fileId, options);
      const key = outcome.updated ? "ORGANIZR.Browser.Updated" : "ORGANIZR.Browser.Imported";
      ui.notifications.info(key, { localize: true, format: { name: outcome.name } });
      this.#warnAll(outcome);
    } catch (error) {
      ui.notifications.error(importErrorKey(error.status ?? -1), { localize: true, format: { message: error.message } });
    } finally {
      this.#importing.delete(fileId);
      this.render({ parts: ["list"] });
    }
  }

  async #importMany(plan, restoreInventory) {
    const sheets = [...plan.create, ...plan.refresh];
    const skipped = plan.skippedLoot.length;
    const tally = { total: sheets.length + skipped, imported: 0, updated: 0, skipped, failed: 0 };
    this.#batchRunning = true;
    for (const sheet of sheets) this.#importing.add(String(sheet.fileId));
    this.render({ parts: ["list"] });
    try {
      for (const sheet of sheets) await this.#importOneOfMany(sheet, restoreInventory, tally);
    } finally {
      for (const sheet of sheets) this.#importing.delete(String(sheet.fileId));
      this.#batchRunning = false;
      this.render({ parts: ["list"] });
    }
    ui.notifications.info("ORGANIZR.Browser.BatchDone", { localize: true, format: tally });
  }

  async #importOneOfMany(sheet, restoreInventory, tally) {
    const fileId = String(sheet.fileId);
    try {
      const outcome = await importSheet(fileId, { recordedUuid: sheet.uuid ?? null, restoreInventory });
      if (outcome.updated) tally.updated += 1;
      else tally.imported += 1;
      this.#warnAll(outcome);
    } catch (error) {
      tally.failed += 1;
      const name = this.#nameOf(fileId);
      ui.notifications.error("ORGANIZR.Browser.BatchFailed", { localize: true, format: { name, message: error.message } });
    } finally {
      this.#importing.delete(fileId);
      this.render({ parts: ["list"] });
    }
  }

  #warnAll(outcome) {
    for (const warning of outcome.warnings) ui.notifications.warn(warning, { localize: true, format: { name: outcome.name } });
    if (outcome.duplicates > 0) {
      const format = { name: outcome.name, count: outcome.duplicates, uuid: outcome.uuid };
      ui.notifications.warn("ORGANIZR.Browser.Duplicates", { localize: true, format });
    }
    this.#notifyCompanions(outcome);
  }

  #notifyCompanions(outcome) {
    const companions = outcome.companions;
    if (companions?.count > 0) {
      const format = { count: companions.count, folder: companions.folderName };
      ui.notifications.info("ORGANIZR.Browser.CompanionsAdded", { localize: true, format });
    }
    if (companions?.failed > 0) {
      const format = { name: outcome.name, count: companions.failed };
      ui.notifications.warn("ORGANIZR.Browser.CompanionsFailed", { localize: true, format });
    }
  }

  #entryOf(fileId) {
    return (this.#entries ?? []).find((candidate) => String(candidate.fileId) === fileId) ?? null;
  }

  async #askFirst(question) {
    this.#confirming = true;
    try {
      return await question();
    } finally {
      this.#confirming = false;
    }
  }

  #nameOf(fileId) {
    return this.#entryOf(fileId)?.name ?? `#${fileId}`;
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

  static async #onImport(event, target) {
    const fileId = target.dataset.fileId;
    if (!game.user.isGM || !fileId || this.#importing.has(fileId) || this.#confirming) return;
    const entry = this.#entryOf(fileId);
    let restoreInventory = false;
    if (linkedWorldDocuments().has(fileId)) {
      const answer = await this.#askFirst(() => confirmRefresh(entry?.name ?? `#${fileId}`, entry?.type));
      if (!answer) return;
      restoreInventory = answer.restoreInventory;
    }
    this.#import(fileId, { recordedUuid: entry?.uuid ?? null, restoreInventory });
  }

  static async #onImportSection(event, target) {
    if (!game.user.isGM || this.#batchRunning || this.#confirming) return;
    const shown = groupSheets(filterSheets(this.#entries, this.#term));
    const sheets = importableSheets(shown, target.dataset.projectId, target.dataset.type || undefined)
      .filter((sheet) => !this.#importing.has(String(sheet.fileId)));
    if (!sheets.length) return;
    const linked = linkedWorldDocuments();
    let plan = batchPlan(sheets, linked, false);
    let restoreInventory = false;
    if (needsBatchConfirm(plan)) {
      const answer = await this.#askFirst(() => confirmBatch(plan));
      if (!answer) return;
      restoreInventory = answer.restoreInventory && plan.skippedLoot.length > 0;
      if (restoreInventory) plan = batchPlan(sheets, linked, true);
    }
    this.#importMany(plan, restoreInventory);
  }
}
