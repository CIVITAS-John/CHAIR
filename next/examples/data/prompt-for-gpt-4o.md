To format other types of data into our JSON format (see `data-format.json` for an example), you can use this prompt. Make sure to edit it based on the nature of your data. Then, send in the `data-format.json` and your data. In our case, the code results in `data-example.json`.

If you plan to re-use GPT-generated code, you may send in a small sample of your data (could be synthesized; just in the same format), and then save the code into a Jupyter Notebook (see the `transformer.ipynb` for an example).

```
Transform all `.txt` files into the format of the example JSON.

Each `.txt` file should be trimmed first. Then, the entirety should be considered as one chunk. The chunk ID should come from the file name.

Identify speakers from each paragraph, each with the format of {$UserID}: {$Content}.

If no time information is available, mark it as "1970-01-01 00:00:00".
```
