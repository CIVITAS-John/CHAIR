export class Stack<T> {
    #stack: T[] = [];

    push(item: T) {
        this.#stack.push(item);
    }

    pop(): T | undefined {
        return this.#stack.pop();
    }

    peek(): T | undefined {
        return this.#stack[this.#stack.length - 1];
    }

    empty() {
        return this.#stack.length === 0;
    }

    clear() {
        this.#stack = [];
    }
}
