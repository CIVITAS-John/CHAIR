import d3 from "d3";

import type { Code } from "../../../schema.js";
import type { Visualizer } from "../visualizer.js";

import {
    filterItemByUser,
    filterNodeByExample,
    filterNodeByOwner,
    filterNodeByOwners,
} from "./graph.js";
import type { Component, Node } from "./schema.js";

/** The base class for filters. */
export abstract class FilterBase<TNode, TParameter> {
    /** The name of the filter. */
    abstract name: string;
    /** The parameters of the filter. */
    parameters: TParameter[] = [];
    /** The mode of the filter. */
    mode = "";
    /** The filter function. */
    abstract filter(visualizer: Visualizer, node: Node<TNode>): boolean;

    /** Get the colorizer for this filter. */
    getColorizer(_visualizer: Visualizer): Colorizer<TNode> | undefined {
        return;
    }

    /** Get the names of the parameters. */
    getParameterNames(_visualizer: Visualizer): string[] {
        return this.parameters.map((param) => JSON.stringify(param));
    }

    /** Toggle the parameters of the filter. */
    toggleParameters(newParam: TParameter, additive: boolean, mode: string): boolean {
        if (mode === this.mode && this.parameters.includes(newParam)) {
            this.parameters.splice(this.parameters.indexOf(newParam), 1);
            this.setParameter(this.parameters);
            return false;
        }
        if (!this.parameters.includes(newParam)) {
            if (additive) {
                this.parameters.splice(this.parameters.length - 1, 0, newParam);
                this.setParameter(this.parameters);
            } else {
                this.setParameter([newParam]);
            }
        }
        this.mode = mode;
        return true;
    }

    /** Set the parameters of the filter. */
    setParameter(newParam: TParameter[]) {
        this.parameters = newParam;
    }
}

/** A colorizer for the graph. */
export interface Colorizer<T> {
    /** The colorizer function. */
    colorize: (node: Node<T>) => string;
    /** The examples of the colorizer. */
    examples: Record<string, string>;
    /** The results of the colorizer. */
    results?: Record<string, Node<T>[]>;
}

/** Filter the nodes by their datasets. */
export class DatasetFilter extends FilterBase<Code, string> {
    /** The name of the filter. */
    override name = "Dataset";
    /** The IDs of the examples. */
    #exampleIDs: string[] = [];

    /** The filter function. */
    override filter(visualizer: Visualizer, node: Node<Code>): boolean {
        if (this.#exampleIDs.length === 0) {
            const sources = visualizer.dataset.source.data;
            this.#exampleIDs = Array.from(
                new Set(
                    Object.entries(sources)
                        .filter(([k]) => this.parameters.includes(k))
                        .flatMap(([, v]) => Object.values(v).flatMap((item) => item.items))
                        .map((example) => example.id),
                ),
            );
        }
        return filterNodeByExample(node, this.#exampleIDs);
    }

    /** Set the parameters of the filter. */
    override setParameter(newParams: string[]) {
        this.parameters = newParams;
        this.#exampleIDs = [];
    }
}

/** ChunkFilter: Filter the nodes by their chunks. */
export class ChunkFilter extends FilterBase<Code, string> {
    /** The name of the filter. */
    override name = "Chunk";
    /** The IDs of the examples. */
    #exampleIDs: string[] = [];

    /** The filter function. */
    override filter(visualizer: Visualizer, node: Node<Code>): boolean {
        if (this.#exampleIDs.length === 0) {
            const sources = visualizer.dataset.source.data;
            this.#exampleIDs = Array.from(
                new Set(
                    Object.values(sources)
                        .flatMap((chunk) => Object.entries(chunk))
                        .filter(([k]) => this.parameters.includes(k))
                        .flatMap(([, value]) => value.items)
                        .map((example) => example.id),
                ),
            );
        }
        return filterNodeByExample(node, this.#exampleIDs);
    }

    /** Set the parameters of the filter. */
    override setParameter(newParams: string[]) {
        this.parameters = newParams;
        this.#exampleIDs = [];
    }
}

/** Filter the nodes by the item's UserID. */
export class UserFilter extends FilterBase<Code, string> {
    /** The name of the filter. */
    override name = "Speaker";
    /** The IDs of the examples. */
    #exampleIDs: string[] = [];

    /** Get the names of the parameters. */
    override getParameterNames(visualizer: Visualizer): string[] {
        return this.parameters.map(
            (param) => visualizer.dataset.uidToNicknames?.get(param) ?? param,
        );
    }

    /** The filter function. */
    override filter(visualizer: Visualizer, node: Node<Code>): boolean {
        if (this.#exampleIDs.length === 0) {
            this.#exampleIDs = filterItemByUser(visualizer.dataset.source, this.parameters).map(
                (item) => item.id,
            );
        }
        return filterNodeByExample(node, this.#exampleIDs);
    }

    /** Set the parameters of the filter. */
    override setParameter(newParams: string[]) {
        this.parameters = newParams;
        this.#exampleIDs = [];
    }
}

/** Filter the nodes by their components. */
export class ComponentFilter extends FilterBase<Code, Component<Code>> {
    /** The name of the filter. */
    override name = "Component";

    /** Get the names of the parameters. */
    override getParameterNames(_visualizer: Visualizer): string[] {
        return this.parameters.map((param) => param.representative?.data.label ?? "");
    }

    /** The filter function. */
    override filter(_visualizer: Visualizer, node: Node<Code>): boolean {
        if (!node.component) {
            return false;
        }
        return this.parameters.includes(node.component);
    }
}

/** Filter the nodes by their owners. */
export class OwnerFilter<T> extends FilterBase<T, number> {
    /** The name of the filter. */
    override name = "Owner";

    /** The filter function. */
    override filter(visualizer: Visualizer, node: Node<T>): boolean {
        return filterNodeByOwners(
            node,
            this.parameters,
            visualizer.parameters.useNearOwners || this.parameters.length === 1,
        );
    }

    /** Get the names of the parameters. */
    override getParameterNames(visualizer: Visualizer): string[] {
        return this.parameters.map((param) => visualizer.dataset.names[param]);
    }

    /** Get the colorizer for this filter. */
    override getColorizer(visualizer: Visualizer): Colorizer<T> {
        if (this.parameters.length === 0) {
            return new OwnerColorizer(
                visualizer.dataset.weights
                    ?.map((Weight, Index) => (Weight > 0 ? Index : -1))
                    .filter((Index) => Index >= 0) ?? [],
                visualizer,
            );
        } else if (this.parameters.length === 1) {
            if (this.mode === "novelty" || this.mode === "divergence") {
                return new NoveltyColorizer(this.parameters[0], visualizer);
            }
            return new CoverageColorizer(this.parameters[0]);
        } else if (this.parameters.length === 2) {
            return new ComparisonColorizer(this.parameters[0], this.parameters[1], visualizer);
        }
        return new OwnerColorizer(this.parameters, visualizer);
    }
}

/** Colorize the nodes by an owner's coverage. */
export class CoverageColorizer<T> implements Colorizer<T> {
    /** Create a coverage colorizer. */
    constructor(public owner: number) {}

    /** The colorizer function. */
    colorize(Node: Node<T>): string {
        return d3.interpolateCool(
            Node.owners.has(this.owner) ? 1 : Node.nearOwners.has(this.owner) ? 0.55 : 0.1,
        );
    }

    /** The examples of the colorizer. */
    examples: Record<string, string> = {
        "In the codebook": d3.interpolateCool(1),
        "Has a similar concept": d3.interpolateCool(0.55),
        "Not covered": "#999999",
    };
}

/** Colorize the nodes by their novelty. */
export class NoveltyColorizer<T> implements Colorizer<T> {
    /** Create a novelty colorizer. */
    constructor(
        public owner: number,
        public visualizer: Visualizer,
    ) {}

    /** The colorizer function. */
    colorize(node: Node<T>): string {
        // Not covered
        if (!node.nearOwners.has(this.owner)) {
            return "#999999";
        }
        if (node.owners.has(this.owner)) {
            let novel = true as boolean;
            node.owners.forEach((Owner) => {
                if (Owner !== this.owner && (this.visualizer.dataset.weights?.[Owner] ?? NaN) > 0) {
                    novel = false;
                }
            });
            // Novel / Conform
            return d3.interpolatePlasma(novel ? 1 : 0.35);
        }
        // Nearly conform
        return d3.interpolatePlasma(0.7);
    }

    /** The examples of the colorizer. */
    examples: Record<string, string> = {
        "Novel: only in this codebook": d3.interpolatePlasma(1),
        "Conform: has a similar concept": d3.interpolatePlasma(0.7),
        "Conform: in the codebook": d3.interpolatePlasma(0.35),
        "Not covered": "#999999",
    };
}

/** Colorize the nodes by two owners' coverage. */
export class ComparisonColorizer<T> implements Colorizer<T> {
    /** Create a comparison colorizer. */
    constructor(
        public owner1: number,
        public owner2: number,
        public visualizer: Visualizer,
    ) {
        this.examples["Both codebooks"] = d3.schemeTableau10[5];
        this.examples[`Only in ${visualizer.dataset.names[owner1]}`] = d3.schemeTableau10[2];
        this.examples[`Only in ${visualizer.dataset.names[owner2]}`] = d3.schemeTableau10[4];
        this.examples["Not covered"] = "#999999";
    }

    /** The colorizer function. */
    colorize(node: Node<T>): string {
        const nearOwner = filterNodeByOwner(
            node,
            this.owner1,
            this.visualizer.parameters.useNearOwners,
        );
        const nearOther = filterNodeByOwner(
            node,
            this.owner2,
            this.visualizer.parameters.useNearOwners,
        );

        return nearOwner && nearOther
            ? d3.schemeTableau10[5]
            : nearOwner
              ? d3.schemeTableau10[2]
              : nearOther
                ? d3.schemeTableau10[4]
                : "#999999";
    }

    /** The examples of the colorizer. */
    examples: Record<string, string> = {};
}

/** Colorize the nodes by how many owners they have. */
export class OwnerColorizer<T> implements Colorizer<T> {
    /** Create an owner colorizer. */
    constructor(
        public owners: number[],
        public visualizer: Visualizer,
    ) {
        for (let i = 1; i <= owners.length; i++) {
            this.examples[
                `In${this.visualizer.parameters.useNearOwners ? " (or near)" : ""} ${i} codebooks`
            ] = d3.interpolateViridis(i / owners.length);
        }
        this.examples["Not covered"] = "#999999";
    }

    /** The colorizer function. */
    colorize(node: Node<T>): string {
        const count = this.owners.filter((Owner) =>
            filterNodeByOwner(node, Owner, this.visualizer.parameters.useNearOwners),
        ).length;
        return count === 0 ? "#999999" : d3.interpolateViridis(count / this.owners.length);
    }

    /** The examples of the colorizer. */
    examples: Record<string, string> = {};
}
