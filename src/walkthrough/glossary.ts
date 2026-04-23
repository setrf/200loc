const glossaryData = {
  llm: {
    title: 'LLM',
    shortDefinition: 'A language model trained to predict and generate text one token at a time.',
    body: [
      'LLM stands for large language model.',
      'Modern chatbots and coding assistants are usually built around language models that repeatedly predict the next token from the context so far.',
    ],
    relatedIds: ['token', 'context', 'autoregressive-generation'],
  },
  inference: {
    title: 'Inference',
    shortDefinition: 'Running a trained model to produce an output.',
    body: [
      'Inference is what happens after training, when the model uses its learned weights to make a prediction.',
      'This walkthrough follows inference in detail: one prefix goes in, the model computes through each block, and one next token comes out.',
    ],
    relatedIds: ['training', 'sampling', 'autoregressive-generation'],
  },
  'model-architecture': {
    title: 'Model Architecture',
    shortDefinition: 'The arrangement of parts that defines how information flows through the model.',
    body: [
      'Architecture is the model’s structure: embeddings, attention, MLP blocks, residual updates, and the output head.',
      'microgpt is tiny, but its architecture uses the same core transformer building blocks that larger text models scale up.',
    ],
    relatedIds: ['token-embedding', 'attention', 'mlp'],
  },
  prefix: {
    title: 'Prefix',
    shortDefinition: 'The text that already exists before the model predicts the next token.',
    body: [
      'A prefix is the beginning part of a sequence that the model already has in front of it.',
      'The model uses that existing text as the starting point for the next-token prediction loop.',
    ],
    relatedIds: ['context', 'autoregressive-generation'],
  },
  context: {
    title: 'Context',
    shortDefinition: 'The text the model is allowed to read before making its next guess.',
    body: [
      'A language model never sees all possible future text at once. At each step, it only sees the text that has already been written plus the current slot it is processing.',
      'That visible text is called the context. The next-token prediction must be made using only that context.',
    ],
    relatedIds: ['slot', 'causal-masking'],
  },
  'visible-history': {
    title: 'Visible History',
    shortDefinition: 'The earlier readable slots the current step is allowed to look back over.',
    body: [
      'Visible history means the portion of the sequence that is already available to the current prediction step.',
      'Attention reads from that visible history instead of from future positions that have not been generated yet.',
    ],
    relatedIds: ['context', 'causal-masking', 'attention'],
  },
  slot: {
    title: 'Slot',
    shortDefinition: 'One position in the running sequence.',
    body: [
      'A slot is a location in the sequence, such as the current position being processed or the next position the model is trying to fill.',
      'The token inside a slot can change as generation continues, but the slot is the position itself.',
    ],
    relatedIds: ['context', 'position-embedding'],
  },
  'token-id': {
    title: 'Token ID',
    shortDefinition: 'The numeric label the model uses for one token in its vocabulary.',
    body: [
      'The model does not compute directly on raw letters or words. It first maps each token to a small integer id.',
      'That id is then used to look up learned vectors and later computations.',
    ],
    relatedIds: ['bos', 'token-embedding'],
  },
  vocabulary: {
    title: 'Vocabulary',
    shortDefinition: 'The full set of token choices the model knows how to name.',
    body: [
      'A model cannot emit arbitrary raw strings directly. It chooses from a fixed vocabulary of tokens it was built to use.',
      'Each token in that vocabulary has its own numeric id and its own learned parameters.',
    ],
    relatedIds: ['token-id', 'bos'],
  },
  token: {
    title: 'Token',
    shortDefinition: 'One small text piece the model can read or write in a single step.',
    body: [
      'A token is the basic chunk the model works with during generation.',
      'A token can be a full word, part of a word, or punctuation, depending on how the tokenizer splits the text.',
    ],
    relatedIds: ['token-id', 'vocabulary'],
  },
  vector: {
    title: 'Vector',
    shortDefinition: 'A list of numbers that the model treats as one representation.',
    body: [
      'In this walkthrough, a vector is just a row of numbers handled together as one object.',
      'The model uses vectors to represent tokens, positions, attention reads, hidden states, and many other intermediate results.',
    ],
    relatedIds: ['token-embedding', 'position-embedding', 'residual-stream'],
  },
  'learned-row': {
    title: 'Learned Row',
    shortDefinition: 'One row fetched from a learned table of model parameters.',
    body: [
      'A learned row is a stored line of numbers that the model has adjusted during training.',
      'Lookup steps such as token embeddings and position embeddings work by selecting one learned row from a larger table.',
    ],
    relatedIds: ['token-table', 'position-table', 'vector'],
  },
  'token-table': {
    title: 'Token Table',
    shortDefinition: 'The learned lookup table whose rows describe tokens.',
    body: [
      'A token table is a matrix the model can index by token id to fetch a learned row.',
      'In this tiny transformer, the WTE table is the token table used to produce token embeddings.',
    ],
    relatedIds: ['wte', 'token-embedding', 'token-id'],
  },
  bos: {
    title: 'BOS',
    shortDefinition: 'A special marker that means beginning of sequence.',
    body: [
      'BOS is a reserved token used to mark the start of the text sequence.',
      'In this tiny demo model, the same marker is also reused as the stop signal during sampling.',
    ],
    relatedIds: ['token-id', 'sampling'],
  },
  'token-embedding': {
    title: 'Token Embedding',
    shortDefinition: 'The learned vector looked up for one token id.',
    body: [
      'A token embedding turns a token id into a richer numeric description the model can compare and transform.',
      'Instead of treating a token as just a label, the model uses the embedding as its learned starting representation.',
    ],
    relatedIds: ['wte', 'position-embedding'],
  },
  wte: {
    title: 'WTE',
    shortDefinition: 'The learned table that stores token embeddings.',
    body: [
      'WTE stands for word token embedding.',
      'It is the matrix where each row holds the learned embedding for one vocabulary token.',
    ],
    relatedIds: ['token-embedding'],
  },
  'position-embedding': {
    title: 'Position Embedding',
    shortDefinition: 'The learned vector that tells the model where a slot sits in the sequence.',
    body: [
      'Tokens need order information as well as identity information. A position embedding gives the model a learned signal for where a token appears.',
      'That is how the model can distinguish early, middle, and late positions even if the token itself is the same.',
    ],
    relatedIds: ['wpe', 'slot'],
  },
  'position-table': {
    title: 'Position Table',
    shortDefinition: 'The learned lookup table whose rows describe sequence positions.',
    body: [
      'A position table is a matrix the model can index by slot number to fetch a learned row.',
      'In this walkthrough, the WPE table is the position table that supplies the model with order information.',
    ],
    relatedIds: ['wpe', 'position-embedding', 'slot'],
  },
  wpe: {
    title: 'WPE',
    shortDefinition: 'The learned table that stores position embeddings.',
    body: [
      'WPE stands for word position embedding.',
      'It is the matrix where each row corresponds to one possible slot position in the sequence.',
    ],
    relatedIds: ['position-embedding'],
  },
  'residual-stream': {
    title: 'Residual Stream',
    shortDefinition: 'The main running vector state that flows through the transformer.',
    body: [
      'The residual stream is the slot state that each major block reads from and writes back into.',
      'Instead of replacing the state completely, the model repeatedly adds updates onto this running stream.',
    ],
    relatedIds: ['residual-connection', 'rmsnorm'],
  },
  'working-state': {
    title: 'Working State',
    shortDefinition: 'The current vector the model is actively transforming for one slot.',
    body: [
      'A working state is the in-progress representation of one slot at the current stage of computation.',
      'As the slot moves through attention, normalization, and MLP updates, the model keeps rewriting that working state.',
    ],
    relatedIds: ['residual-stream', 'vector', 'slot'],
  },
  rmsnorm: {
    title: 'RMSNorm',
    shortDefinition: 'A rescaling step that keeps vector values numerically well-behaved.',
    body: [
      'RMSNorm stands for root-mean-square normalization.',
      'It adjusts the overall scale of a vector so later layers react to the pattern of values rather than to accidental size differences.',
    ],
    relatedIds: ['residual-stream'],
  },
  normalization: {
    title: 'Normalization',
    shortDefinition: 'A rescaling step that puts values onto a more stable shared scale.',
    body: [
      'Normalization changes numbers so later computations are less sensitive to accidental scale differences.',
      'Different normalizations do this in different ways, but the common goal is to keep the math more stable and interpretable.',
    ],
    relatedIds: ['rmsnorm', 'softmax'],
  },
  attention: {
    title: 'Attention',
    shortDefinition: 'The mechanism that lets the current slot decide which visible slots matter.',
    body: [
      'Attention acts like a content-based read from the visible history.',
      'It compares the current slot against earlier slots, decides how much each one matters, and blends the returned information.',
    ],
    relatedIds: ['query', 'key', 'value', 'attention-head'],
  },
  query: {
    title: 'Query',
    shortDefinition: 'The search request vector for the current slot.',
    body: [
      'A query describes what kind of information the current slot is trying to find.',
      'The model compares this query against keys from visible slots to decide what looks relevant.',
    ],
    relatedIds: ['attention', 'key'],
  },
  key: {
    title: 'Key',
    shortDefinition: 'The description vector a slot exposes for matching.',
    body: [
      'A key is the representation a slot offers so another slot can test whether it matches the current query.',
      'Queries and keys are compared to produce raw attention scores.',
    ],
    relatedIds: ['attention', 'query', 'attention-score'],
  },
  value: {
    title: 'Value',
    shortDefinition: 'The information vector a slot contributes when attention reads from it.',
    body: [
      'The value is the payload that actually gets mixed together after the model decides where to look.',
      'Queries decide what to search for, keys decide what matches, and values are what come back.',
    ],
    relatedIds: ['attention', 'query', 'key'],
  },
  'attention-score': {
    title: 'Attention Score',
    shortDefinition: 'The raw match number produced when a query is compared with a key.',
    body: [
      'Each visible slot gets one score per head before any normalization happens.',
      'These scores are evidence of relevance, not probabilities yet.',
    ],
    relatedIds: ['query', 'key', 'softmax'],
  },
  'causal-masking': {
    title: 'Causal Masking',
    shortDefinition: 'The rule that blocks future positions from influencing the current prediction.',
    body: [
      'Autoregressive generation must not peek ahead. Causal masking enforces that by hiding future slots during attention.',
      'The current slot may read itself and earlier slots, but not later ones.',
    ],
    relatedIds: ['context', 'attention'],
  },
  softmax: {
    title: 'Softmax',
    shortDefinition: 'A function that turns scores into positive weights that add up to one.',
    body: [
      'Softmax rescales a list of raw scores into a normalized distribution.',
      'In attention it turns match scores into read weights, and in the output layer it turns logits into probabilities.',
    ],
    relatedIds: ['attention-score', 'logit', 'temperature'],
  },
  'read-weight': {
    title: 'Read Weight',
    shortDefinition: 'The normalized amount of attention assigned to one visible slot.',
    body: [
      'A read weight says how strongly the model should read from a particular visible slot during attention.',
      'Larger read weights give a slot more influence over the blended result that comes back.',
    ],
    relatedIds: ['softmax', 'attention', 'probability-distribution'],
  },
  'focus-pattern': {
    title: 'Focus Pattern',
    shortDefinition: 'The overall way one attention head spreads its read weights across visible slots.',
    body: [
      'A focus pattern is the shape made by all the read weights in one attention head taken together.',
      'It shows whether the head is concentrating on one place, spreading out broadly, or splitting attention across several places.',
    ],
    relatedIds: ['attention-head', 'read-weight', 'softmax'],
  },
  'weight-table': {
    title: 'Weight Table',
    shortDefinition: 'A learned table of numbers used to transform one vector into another.',
    body: [
      'A weight table is a learned matrix that the model multiplies by an input vector to produce a new representation.',
      'Query, key, value, MLP, and output projection steps all use weight tables to create new vectors.',
    ],
    relatedIds: ['vector', 'output-projection', 'mlp'],
  },
  'model-width': {
    title: 'Model Width',
    shortDefinition: 'The standard size of the main vectors that flow through the model.',
    body: [
      'Model width is the number of components in the transformer’s main slot state.',
      'When a temporary result becomes wider or narrower than that standard size, the model uses learned projections to change it back.',
    ],
    relatedIds: ['residual-stream', 'output-projection', 'vector'],
  },
  'attention-head': {
    title: 'Attention Head',
    shortDefinition: 'One independent attention channel with its own query, key, and value weights.',
    body: [
      'Each head can learn to focus on different patterns in the visible history.',
      'Running several heads in parallel lets the model gather different kinds of evidence at the same time.',
    ],
    relatedIds: ['attention', 'query', 'key', 'value'],
  },
  'output-projection': {
    title: 'Output Projection',
    shortDefinition: 'The learned map that turns joined head outputs back into one model-width vector.',
    body: [
      'Attention heads are concatenated into a wider vector. The output projection compresses that wider result back to the model’s normal width.',
      'That makes the attention result compatible with the residual stream again.',
    ],
    relatedIds: ['attention-head', 'residual-stream'],
  },
  'residual-connection': {
    title: 'Residual Connection',
    shortDefinition: 'A skip-style update that adds a block’s result back onto the running state.',
    body: [
      'Instead of discarding the earlier state, a residual connection keeps it and adds the new block output on top.',
      'This helps information survive across layers while still allowing focused updates.',
    ],
    relatedIds: ['residual-stream'],
  },
  mlp: {
    title: 'MLP',
    shortDefinition: 'The small feed-forward block that processes one slot locally.',
    body: [
      'MLP stands for multilayer perceptron.',
      'In a transformer block, the MLP is the local computation stage that transforms one slot after attention has gathered information.',
    ],
    relatedIds: ['hidden-layer', 'relu'],
  },
  'hidden-layer': {
    title: 'Hidden Layer',
    shortDefinition: 'A temporary internal representation used during computation.',
    body: [
      'The hidden layer is not an output shown to the user. It is an intermediate workspace used inside the MLP.',
      'The model expands into this larger space, transforms the values, and then projects back down.',
    ],
    relatedIds: ['mlp', 'relu'],
  },
  relu: {
    title: 'ReLU',
    shortDefinition: 'A non-linear gate that turns negative values into zero and keeps positive values.',
    body: [
      'ReLU stands for rectified linear unit.',
      'It adds non-linearity so the MLP can do more than a single plain linear remapping.',
    ],
    relatedIds: ['mlp', 'hidden-layer'],
  },
  'lm-head': {
    title: 'LM Head',
    shortDefinition: 'The final learned layer that turns the slot state into one score per vocabulary token.',
    body: [
      'LM stands for language model.',
      'The LM head is the last linear layer before the model converts raw scores into probabilities.',
    ],
    relatedIds: ['logit', 'softmax'],
  },
  logit: {
    title: 'Logit',
    shortDefinition: 'One raw score for one candidate token before probabilities are computed.',
    body: [
      'A logit is not yet a probability. It is an unnormalized preference score.',
      'Softmax later turns the full set of logits into a probability distribution.',
    ],
    relatedIds: ['lm-head', 'softmax', 'temperature'],
  },
  temperature: {
    title: 'Temperature',
    shortDefinition: 'The control that makes a probability distribution sharper or flatter before sampling.',
    body: [
      'Lower temperature makes the model more concentrated on its top choices. Higher temperature spreads probability mass more broadly.',
      'It changes how strongly the model commits before the sampling step chooses one token.',
    ],
    relatedIds: ['softmax', 'sampling', 'logit'],
  },
  'probability-distribution': {
    title: 'Probability Distribution',
    shortDefinition: 'A full set of probabilities spread across all available choices.',
    body: [
      'A probability distribution does not just name the top answer. It assigns some amount of probability to every candidate in the competition.',
      'Sampling then uses that whole distribution to choose one concrete outcome.',
    ],
    relatedIds: ['softmax', 'sampling', 'temperature'],
  },
  sampling: {
    title: 'Sampling',
    shortDefinition: 'Choosing one concrete token from the model’s predicted probability distribution.',
    body: [
      'After probabilities are computed, the model still needs one actual next token to continue generation.',
      'Sampling performs that final choice according to the distribution.',
    ],
    relatedIds: ['temperature', 'seeded-sampler', 'autoregressive-generation'],
  },
  training: {
    title: 'Training',
    shortDefinition: 'The long process where the model adjusts its internal weights by learning from lots of text.',
    body: [
      'Training happens before the finished model is used in a product like this walkthrough.',
      'During training, the model repeatedly compares its guesses with real text and adjusts its weights so future guesses improve.',
    ],
    relatedIds: ['weight-table', 'sampling'],
  },
  'seeded-sampler': {
    title: 'Seeded Sampler',
    shortDefinition: 'A sampler that starts from a fixed random state so its choices can repeat.',
    body: [
      'Randomness can be made repeatable by setting a seed.',
      'That is useful in a walkthrough because the same prefix can produce the same shown sequence every time.',
    ],
    relatedIds: ['sampling'],
  },
  'autoregressive-generation': {
    title: 'Autoregressive Generation',
    shortDefinition: 'Predicting one token, appending it, and then using the longer sequence to predict the next one.',
    body: [
      'Language models generate text step by step, not all at once.',
      'Each newly chosen token becomes part of the next context, and the whole process repeats.',
    ],
    relatedIds: ['context', 'sampling'],
  },
  'stop-marker': {
    title: 'Stop Marker',
    shortDefinition: 'A special token that tells the generation loop to end.',
    body: [
      'A stop marker is a reserved token with control meaning rather than normal text meaning.',
      'When sampling returns that marker, the model stops appending tokens and ends the current generation run.',
    ],
    relatedIds: ['bos', 'sampling', 'autoregressive-generation'],
  },
  hallucination: {
    title: 'Hallucination',
    shortDefinition: 'A fluent-sounding answer that is not actually supported by the facts.',
    body: [
      'A model can produce text that sounds confident because it is good at pattern completion, not because it has verified the claim.',
      'That is why plausible wording and factual accuracy are not the same thing.',
    ],
    relatedIds: ['sampling', 'context'],
  },
} as const satisfies Record<
  string,
  {
    title: string
    shortDefinition: string
    body: readonly string[]
    relatedIds: readonly string[]
  }
>

export type GlossaryId = keyof typeof glossaryData

export interface GlossaryEntry {
  id: GlossaryId
  title: string
  shortDefinition: string
  body: string[]
  relatedIds: GlossaryId[]
}

export const glossaryEntries = Object.fromEntries(
  Object.entries(glossaryData).map(([id, entry]) => [
    id,
    {
      id: id as GlossaryId,
      title: entry.title,
      shortDefinition: entry.shortDefinition,
      body: [...entry.body],
      relatedIds: [...entry.relatedIds] as GlossaryId[],
    } satisfies GlossaryEntry,
  ]),
) as Record<GlossaryId, GlossaryEntry>

export function getGlossaryEntry(id: GlossaryId): GlossaryEntry {
  return glossaryEntries[id]
}
