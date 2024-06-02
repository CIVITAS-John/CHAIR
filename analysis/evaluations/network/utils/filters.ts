import d3 from 'd3';
import { Visualizer } from "../visualizer.js";
import { FilterNodeByOwner, FilterNodeByOwners } from "./graph.js";
import { Component, Node } from "./schema.js";

/** FilterBase: The base class for filters. */
export abstract class FilterBase<TNode, TParameter> {
    /** Name: The name of the filter. */
    public abstract Name: string;
    /** Parameters: The parameters of the filter. */
    public Parameters: TParameter[] = [];
    /** Mode: The mode of the filter. */
    public Mode: string = "";
    /** Filter: The filter function. */
    public abstract Filter(Visualizer: Visualizer, Node: Node<TNode>): boolean;
    /** GetColorizer: Get the colorizer for this filter. */
    public GetColorizer(Visualizer: Visualizer): Colorizer<TNode> | undefined { return; }
    /** ToggleParameters: Toggle the parameters of the filter. */
    public ToggleParameters(NewParameters: TParameter, Additive: boolean, Mode: string): boolean { 
        if (Mode == this.Mode && this.Parameters.includes(NewParameters)) {
            this.Parameters.splice(this.Parameters.indexOf(NewParameters), 1);
            return false;
        } else {
            if (!this.Parameters.includes(NewParameters)) {
                if (Additive) {
                    this.Parameters.push(NewParameters);
                } else {
                    this.Parameters = [NewParameters];
                }
            }
            this.Mode = Mode;
            return true;
        }
    }
}

/** Colorizer: A colorizer for the graph. */
export interface Colorizer<T> {
    /** Colorize: The colorizer function. */
    Colorize: (Node: Node<T>) => string;
    /** Examples: The examples of the colorizer. */
    Examples: Record<string, string>;
    /** Results: The results of the colorizer. */
    Results?: Record<string, Node<T>[]>;
}

/** ComponentFilter: Filter the nodes by their components. */
export class ComponentFilter<T> extends FilterBase<T, Component<T>> {
    /** Name: The name of the filter. */
    public Name: string = "Component";
    /** Filter: The filter function. */
    public Filter(Visualizer: Visualizer, Node: Node<T>): boolean {
        if (!Node.Component) return false;
        return this.Parameters.includes(Node.Component);
    }
}

/** OwnerFilter: Filter the nodes by their owners. */
export class OwnerFilter<T> extends FilterBase<T, number> {
    /** Name: The name of the filter. */
    public Name: string = "Owner";
    /** Filter: The filter function. */
    public Filter(Visualizer: Visualizer, Node: Node<T>): boolean {
        return FilterNodeByOwners(Node, this.Parameters, 
            Visualizer.Parameters.UseNearOwners || this.Parameters.length == 1);
    }
    /** GetColorizer: Get the colorizer for this filter. */
    public GetColorizer(Visualizer: Visualizer): Colorizer<T> {
        if (this.Parameters.length == 0) {
            return new OwnerColorizer(Visualizer.Dataset.Names.map((_, Index) => Index).slice(1), Visualizer);
        } else if (this.Parameters.length == 1) {
            if (this.Mode == "Novelty" || this.Mode == "Conformity")
                return new NoveltyColorizer(this.Parameters[0]);
            else return new CoverageColorizer(this.Parameters[0]);
        } else if (this.Parameters.length == 2) {
            return new ComparisonColorizer(this.Parameters[0], this.Parameters[1], Visualizer);
        } else {
            return new OwnerColorizer(this.Parameters, Visualizer);
        }
    }
}

/** CoverageColorizer: Colorize the nodes by an owner's coverage. */
export class CoverageColorizer<T> implements Colorizer<T> {
    /** Constructor: Create a coverage colorizer. */
    public constructor(public Owner: number) { }
    /** Colorize: The colorizer function. */
    public Colorize(Node: Node<T>): string {
        return d3.interpolateCool(Node.Owners.has(this.Owner) ? 1 : Node.NearOwners.has(this.Owner) ? 0.55 : 0.1);
    }
    /** Examples: The examples of the colorizer. */
    public Examples: Record<string, string> = {
        "In the codebook": d3.interpolateCool(1),
        "Has a similar concept": d3.interpolateCool(0.55),
        "Not covered": "#999999"
    };
}

/** NoveltyColorizer: Colorize the nodes by their novelty. */
export class NoveltyColorizer<T> implements Colorizer<T> {
    /** Constructor: Create a novelty colorizer. */
    public constructor(public Owner: number) { }
    /** Colorize: The colorizer function. */
    public Colorize(Node: Node<T>): string {
        // Not covered
        if (!Node.NearOwners.has(this.Owner))
            return "#999999";
        // Novel
        if (Node.NearOwners.size == (Node.NearOwners.has(0) ? 2 : 1))
            return d3.interpolatePlasma(1);
        // Conform
        if (Node.Owners.has(this.Owner) && Node.Owners.size == (Node.Owners.has(0) ? 2 : 1))
            return d3.interpolatePlasma(0.7);
        else
            return d3.interpolatePlasma(0.35);
    }
    /** Examples: The examples of the colorizer. */
    public Examples: Record<string, string> = {
        "Novel: only in this codebook": d3.interpolatePlasma(1),
        "Conform: in the codebook": d3.interpolatePlasma(0.7),
        "Conform: has a similar concept": d3.interpolatePlasma(0.35),
        "Not covered": "#999999"
    };
}

/** ComparisonColorizer: Colorize the nodes by two owners' coverage. */
export class ComparisonColorizer<T> implements Colorizer<T> {
    /** Constructor: Create a comparison colorizer. */
    public constructor(public Owner1: number, public Owner2: number, public Visualizer: Visualizer) {
        this.Examples[`Both codebooks`] = d3.schemeTableau10[5];
        this.Examples[`Only in ${Visualizer.Dataset.Names[Owner1]}`] = d3.schemeTableau10[2];
        this.Examples[`Only in ${Visualizer.Dataset.Names[Owner2]}`] = d3.schemeTableau10[4];
        this.Examples[`Not covered`] = "#999999";
    }
    /** Colorize: The colorizer function. */
    public Colorize(Node: Node<T>): string {
        var NearOwner = FilterNodeByOwner(Node, this.Owner1, this.Visualizer.Parameters.UseNearOwners);
        var NearOther = FilterNodeByOwner(Node, this.Owner2, this.Visualizer.Parameters.UseNearOwners);
        return NearOwner && NearOther ? d3.schemeTableau10[5] : NearOwner ? d3.schemeTableau10[2] : NearOther ? d3.schemeTableau10[4] : "#999999";
    }
    /** Examples: The examples of the colorizer. */
    public Examples: Record<string, string> = {};
}

/** OwnerColorizer: Colorize the nodes by how many owners they have. */
export class OwnerColorizer<T> implements Colorizer<T> {
    /** Constructor: Create an owner colorizer. */
    public constructor(public Owners: number[], public Visualizer: Visualizer) {
        for (var I = 1; I <= Owners.length; I++)
            this.Examples[`In${this.Visualizer.Parameters.UseNearOwners ? " (or near)" : ""} ${I} codebooks`] = d3.interpolateViridis(I / Owners.length);
        this.Examples["Not covered"] = "#999999";
    }
    /** Colorize: The colorizer function. */
    public Colorize(Node: Node<T>): string {
        var Count = this.Owners.filter(Owner => FilterNodeByOwner(Node, Owner, this.Visualizer.Parameters.UseNearOwners)).length;
        return Count == 0 ? "#999999" : d3.interpolateViridis(Count / this.Owners.length);
    }
    /** Examples: The examples of the colorizer. */
    public Examples: Record<string, string> = {};
}