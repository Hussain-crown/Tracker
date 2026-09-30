// Hand-built Apple Shortcuts (.shortcut) file generator.
//
// This is Apple's reverse-engineered, undocumented WFWorkflow plist format --
// there's no public API to generate these server-side, and no way to test an
// exported file without a real iPhone. The STATIC builder (buildStaticShortcut)
// has no moving parts (no variables/user input, just a literal JSON body) and
// is the low-risk, well-trodden shape of this format. The PROMPTED builder
// (buildPromptedShortcut) additionally wires an "Ask for Input" action's
// output into the JSON body via the format's attachment-reference mechanism,
// which is the part of this spec most likely to need a manual tweak on a
// real device if Apple's exact serialization has drifted -- if an exported
// shortcut fails to import, the per-endpoint manual setup docs are the
// guaranteed-working fallback.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function textToken(value: string): string {
  return `<dict><key>Value</key><dict><key>string</key><string>${esc(value)}</string></dict><key>WFSerializationType</key><string>WFTextTokenString</string></dict>`
}

function dictItem(key: string, valueXml: string): string {
  return `<dict><key>WFItemType</key><integer>0</integer><key>WFKey</key>${textToken(key)}<key>WFValue</key>${valueXml}</dict>`
}

function dictionaryFieldValue(items: string): string {
  return `<dict><key>Value</key><dict><key>WFDictionaryFieldValueItems</key><array>${items}</array></dict><key>WFSerializationType</key><string>WFDictionaryFieldValue</string></dict>`
}

// A JSON/header value that references a prior "Ask for Input" action's
// output, instead of a literal string -- the attachment-reference mechanism
// mentioned above.
function tokenFromActionOutput(outputUuid: string): string {
  return `<dict><key>Value</key><dict><key>string</key><string>￼</string><key>attachmentsByRange</key><dict><key>{0, 1}</key><dict><key>Type</key><string>ActionOutput</string><key>OutputUUID</key><string>${outputUuid}</string><key>OutputName</key><string>Provided Input</string></dict></dict></dict><key>WFSerializationType</key><string>WFTextTokenString</string></dict>`
}

interface JsonField { key: string; literal?: string; fromActionUuid?: string }

function buildDownloadUrlAction(opts: {
  url: string
  apiKey: string
  fields: JsonField[]
}): string {
  const headerItems = dictItem('x-api-key', textToken(opts.apiKey)) + dictItem('Content-Type', textToken('application/json'))
  const jsonItems = opts.fields.map(f => dictItem(f.key, f.fromActionUuid ? tokenFromActionOutput(f.fromActionUuid) : textToken(f.literal ?? ''))).join('')
  return `<dict>
    <key>WFWorkflowActionIdentifier</key><string>is.workflow.actions.downloadurl</string>
    <key>WFWorkflowActionParameters</key><dict>
      <key>WFURL</key><string>${esc(opts.url)}</string>
      <key>WFHTTPMethod</key><string>POST</string>
      <key>WFHTTPHeaders</key>${dictionaryFieldValue(headerItems)}
      <key>WFHTTPBodyType</key><string>JSON</string>
      <key>WFJSONValues</key>${dictionaryFieldValue(jsonItems)}
    </dict>
  </dict>`
}

// One "Ask for Input" (text) action, tagged with a UUID so a later action's
// JSON body can reference "Provided Input" from it.
function buildAskForInputAction(uuid: string, prompt: string): string {
  return `<dict>
    <key>WFWorkflowActionIdentifier</key><string>is.workflow.actions.ask</string>
    <key>WFWorkflowActionParameters</key><dict>
      <key>UUID</key><string>${uuid}</string>
      <key>WFAskActionPrompt</key><string>${esc(prompt)}</string>
      <key>WFInputType</key><string>Text</string>
    </dict>
  </dict>`
}

function wrapWorkflow(name: string, actionsXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>WFWorkflowClientVersion</key><string>1128.0.2</string>
  <key>WFWorkflowMinimumClientVersion</key><integer>900</integer>
  <key>WFWorkflowMinimumClientVersionString</key><string>900</string>
  <key>WFWorkflowIcon</key><dict>
    <key>WFWorkflowIconStartColor</key><integer>431817727</integer>
    <key>WFWorkflowIconGlyphNumber</key><integer>59511</integer>
  </dict>
  <key>WFWorkflowImportQuestions</key><array/>
  <key>WFWorkflowTypes</key><array><string>NCWidget</string><string>WatchKit</string></array>
  <key>WFWorkflowInputContentItemClasses</key><array>
    <string>WFAppStoreAppContentItem</string>
    <string>WFArticleContentItem</string>
    <string>WFContactContentItem</string>
    <string>WFDateContentItem</string>
    <string>WFEmailAddressContentItem</string>
    <string>WFGenericFileContentItem</string>
    <string>WFImageContentItem</string>
    <string>WFiTunesProductContentItem</string>
    <string>WFLocationContentItem</string>
    <string>WFDCMapsLinkContentItem</string>
    <string>WFAVAssetContentItem</string>
    <string>WFPDFContentItem</string>
    <string>WFPhoneNumberContentItem</string>
    <string>WFRichTextContentItem</string>
    <string>WFSafariWebPageContentItem</string>
    <string>WFStringContentItem</string>
    <string>WFURLContentItem</string>
  </array>
  <key>WFWorkflowActions</key><array>${actionsXml}</array>
  <key>WFWorkflowName</key><string>${esc(name)}</string>
</dict>
</plist>`
}

// Zero-input shortcut -- a literal, fixed JSON body. No variables, no
// user-facing prompts: the lowest-risk shape of this file format, and
// exactly what a one-tap Home Screen/Today View widget wants.
export function buildStaticShortcut(opts: { name: string; url: string; apiKey: string; jsonBody: Record<string, string> }): string {
  const fields: JsonField[] = Object.entries(opts.jsonBody).map(([key, literal]) => ({ key, literal }))
  const action = buildDownloadUrlAction({ url: opts.url, apiKey: opts.apiKey, fields })
  return wrapWorkflow(opts.name, action)
}

// Prompts for one or more pieces of free text in sequence, then sends each
// as its own JSON field alongside any literal fields in staticBody. Covers
// "what's their name" (log-prospect, one prompt) and "name + stage"
// (stage-candidate, two prompts) without hand-building a separate shape per
// shortcut.
export function buildMultiPromptShortcut(opts: {
  name: string
  url: string
  apiKey: string
  prompts: { fieldKey: string; prompt: string }[]
  staticBody?: Record<string, string>
}): string {
  let actionsXml = ''
  const promptFields: JsonField[] = []
  opts.prompts.forEach((p, i) => {
    const uuid = `B3B5A6C1-0000-4A00-9C00-00000000000${i + 1}`
    actionsXml += buildAskForInputAction(uuid, p.prompt)
    promptFields.push({ key: p.fieldKey, fromActionUuid: uuid })
  })
  const fields: JsonField[] = [
    ...promptFields,
    ...Object.entries(opts.staticBody ?? {}).map(([key, literal]) => ({ key, literal })),
  ]
  actionsXml += buildDownloadUrlAction({ url: opts.url, apiKey: opts.apiKey, fields })
  return wrapWorkflow(opts.name, actionsXml)
}
