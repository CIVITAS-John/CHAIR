/**
 * Generic Stack Data Structure
 *
 * Simple LIFO (Last-In-First-Out) stack implementation using a private array.
 * Used primarily by the logger to maintain nested context stacks for sources and prefixes.
 *
 * @template T - Type of items stored in the stack
 */
export class Stack<T> {
    #stack: T[] = [];

    /**
     * Push an item onto the top of the stack
     * @param item - Item to add
     */
    push(item: T) {
        this.#stack.push(item);
    }

    /**
     * Remove and return the top item from the stack
     * @returns The top item, or undefined if stack is empty
     */
    pop(): T | undefined {
        return this.#stack.pop();
    }

    /**
     * View the top item without removing it
     * @returns The top item, or undefined if stack is empty
     */
    peek(): T | undefined {
        return this.#stack[this.#stack.length - 1];
    }

    /**
     * Check if the stack is empty
     * @returns True if stack has no items
     */
    empty() {
        return this.#stack.length === 0;
    }

    /**
     * Remove all items from the stack
     */
    clear() {
        this.#stack = [];
    }
}
