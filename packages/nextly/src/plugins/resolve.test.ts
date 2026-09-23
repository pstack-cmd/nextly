import { describe, it, expect } from "vitest";
import { NextlyError } from "../errors/nextly-error";
import type { PluginDefinition } from "./plugin-context";
import { resolvePlugins } from "./resolve";

const p = (
  name: string,
  over: Partial<PluginDefinition> = {}
): PluginDefinition => ({
  name,
  version: "1.0.0",
  nextly: "*",
  ...over,
});

describe("resolvePlugins", () => {
  it("validates versions then returns dependency order", () => {
    const out = resolvePlugins(
      [p("a", { dependsOn: { b: "^1.0.0" } }), p("b")],
      { coreVersion: "1.0.0" }
    );
    expect(out.map(x => x.name)).toEqual(["b", "a"]);
  });

  /**
   * The wiring, not the check. `validatePluginSlugs` has its own suite; this
   * asserts `resolvePlugins` actually calls it — without this, removing the
   * call leaves every slug test green while nothing at boot runs it.
   *
   * The two names differ only by separators, which is the whole point: they
   * are distinct legal packages that produce one admin address.
   */
  it("rejects two plugins that resolve to the same admin slug", () => {
    let reason: string | undefined;
    try {
      resolvePlugins([p("@acme/plugin-seo"), p("acme_plugin_seo")], {
        coreVersion: "1.0.0",
      });
    } catch (error) {
      reason = (error as { logContext?: { reason?: string } }).logContext
        ?.reason;
    }
    expect(reason).toBe("duplicate-admin-slug");
  });

  it("surfaces a version error even when the graph is otherwise orderable", () => {
    expect(() =>
      resolvePlugins([p("a", { nextly: ">=2.0.0" }), p("b")], {
        coreVersion: "1.0.0",
      })
    ).toThrow(/Plugin configuration is invalid/i);
  });
});

describe("resolvePlugins: schemaVersion declarations", () => {
  const opts = { coreVersion: "0.0.2-alpha.66" };

  it("refuses a schemaVersion with no migrations to reach it", () => {
    expect(() =>
      resolvePlugins(
        [p("stub", { schemaVersion: 2 } as Partial<PluginDefinition>)],
        opts
      )
    ).toThrow(NextlyError);
  });

  it("refuses a schemaVersion its newest migration does not equal", () => {
    expect(() =>
      resolvePlugins(
        [
          p("stub", {
            schemaVersion: 3,
            contributes: {
              schema: {
                migrations: [
                  { name: "001", schemaVersion: 1, checksum: "a", dialects: {} as never, snapshot: {} as never, before: {} as never },
                  { name: "002", schemaVersion: 2, checksum: "b", dialects: {} as never, snapshot: {} as never, before: {} as never },
                ],
              },
            },
          } as Partial<PluginDefinition>),
        ],
        opts
      )
    ).toThrow(NextlyError);
  });

  it("accepts a declaration its newest migration reaches", () => {
    expect(
      resolvePlugins(
        [
          p("stub", {
            schemaVersion: 2,
            contributes: {
              schema: {
                migrations: [
                  { name: "002", schemaVersion: 2, checksum: "b", dialects: {} as never, snapshot: {} as never, before: {} as never },
                ],
              },
            },
          } as Partial<PluginDefinition>),
        ],
        opts
      )
      ).toHaveLength(1);
  });
});
