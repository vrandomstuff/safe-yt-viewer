' MainScene - the entire user interface.
'
' Scope rules that shape this file:
'   * Nothing in source/ is visible here, so every tunable arrives in the
'     "ready" handshake from the main thread rather than being duplicated.
'   * The only way to talk to the main thread is the apiRequest field; the
'     only way it talks back is apiResult. There is no direct access to
'     roUrlTransfer or roRegistrySection from a component script, and no
'     reason to want one. The keyboard is a node in this scene, not one of
'     them - see the dialogs section.

' Node ids mirrored in components/MainScene.xml.
'
' The tab bar is three Labels (tab0..tab2) in the tabs Group, not a list -
' see the comment above <Group id="tabs"> for why a LabelList cannot do it.

' Ticks of the 0.5s stateTimer the play overlay stays up after a keypress, so
' 10 is five seconds. Counted in ticks rather than seconds so the auto-hide needs
' no timer of its own. A function rather than a const because this is a .brs
' file, where BrighterScript rejects const declarations (BS1019).
function OverlayTicks() as Integer
    return 10
end function

' One tab's width, and the selection underline's local y, mirroring the
' geometry in components/MainScene.xml. Functions for the same reason as
' OverlayTicks(), and for the same reason they cannot live in source/config.bs
' either: this is a component scope and config.bs is the main thread's.
function TabWidth() as Integer
    return 220
end function

function TabMarkerY() as Integer
    return 52
end function

sub init()
    m.tabs = m.top.findNode("tabs")
    m.serverLabel = m.top.findNode("serverLabel")
    m.statusLabel = m.top.findNode("statusLabel")
    m.browseGroup = m.top.findNode("browseGroup")
    m.grid = m.top.findNode("grid")
    m.playGroup = m.top.findNode("playGroup")
    m.playOverlay = m.top.findNode("playOverlay")
    m.playTitle = m.top.findNode("playTitle")
    m.playStatus = m.top.findNode("playStatus")
    m.video = m.top.findNode("video")
    m.hintLabel = m.top.findNode("hintLabel")
    m.tabNodes = NewArray()
    m.tabNodes.Push(m.top.findNode("tab0"))
    m.tabNodes.Push(m.top.findNode("tab1"))
    m.tabNodes.Push(m.top.findNode("tab2"))
    m.tabMarker = m.top.findNode("tabMarker")
    m.playChosen = {}
    m.playChannel = ""
    m.overlayShowing = true
    m.showTicks = 0

    ' The main thread is the only place a blocking Wait() is safe, so the
    ' video state is sampled on the Timer declared in the XML rather than
    ' observed. Note the field is `duration` in seconds, not `interval`.
    m.stateTimer = m.top.findNode("stateTimer")
    if m.stateTimer <> invalid then
        m.stateTimer.observeField("fire", "sampleVideoState")
        ' Started here, not from the XML: a Timer with repeat="true" left
        ' unstarted in markup is the documented way to keep it idle until the
        ' component is actually up.
        m.stateTimer.control = "start"
    end if
    if m.grid <> invalid then
        m.grid.observeField("itemFocused", "onItemFocused")
        m.grid.observeField("itemSelected", "onItemSelected")
    end if
    if m.tabs <> invalid then
        ' focusedChild fires whenever a tab gains or loses the key focus, which
        ' is the only thing that has to repaint the tab bar. The field's VALUE
        ' is never read - the Node reference says reading it is a script error -
        ' so focusedTab() asks each Label for hasFocus() instead.
        m.tabs.observeField("focusedChild", "onTabFocusChanged")
    end if

    m.mode = ""
    m.query = ""
    m.items = NewArray()
    m.seen = {}
    m.content = invalid
    m.tabIndex = modeToTab(m.mode)
    m.page = 1
    m.exhausted = false
    m.loading = false
    m.reqId = 0
    m.ready = false
    m.playing = false
    m.playFailed = false
    m.playAttempt = 0
    m.playAttempts = 1
    m.playlistUrl = ""
    m.pageSize = 50
    m.lookahead = 15

    ' StandardKeyboardDialog state. m.dialog is the live node while the keyboard
    ' is up and invalid the rest of the time, which is what onKeyEvent tests to
    ' stay out of its way. m.dialogButton stays -1 until a button is pressed,
    ' m.dialogText mirrors the entered string, and m.dialogDismissed records a
    ' Back/Home/Options, which the dialog consumes itself to close. See the
    ' dialogs section below for why the text is mirrored rather than read.
    m.dialog = invalid
    m.dialogPurpose = ""
    m.dialogText = ""
    m.dialogButton = -1
    m.dialogDismissed = false
    m.dialogTab = -1

    paintTabs()

    ' Focus is deliberately NOT set here: init() runs before show(), so the
    ' focus chain does not exist yet. handlePage() takes focus once real content
    ' has arrived, which is after the scene is on screen.
    m.top.apiRequest = { type: "ready" }
end sub


' ------------------------------------------------------------------ result

sub onApiResult()
    msg = m.top.apiResult
    if type(msg) <> "roAssociativeArray" then
        return
    end if
    if not msg.DoesExist("type") then
        return
    end if

    kind = msg.type
    if kind = "ready" then
        ' The main thread offers this unasked as well as on request, so that it
        ' does not depend on whether its observer was registered before this
        ' component's init() ran. Ignore the second one: re-running selectMode
        ' would reset the in-flight page request.
        if m.ready then
            return
        end if
        m.baseUrl = msg.baseUrl
        m.allowInsecure = msg.allowInsecure
        m.defaultBaseUrl = msg.defaultBaseUrl
        m.pageSize = msg.pageSize
        m.lookahead = msg.pageLookahead
        m.ready = true
        showServer()
        selectMode("videos", "")
    else if kind = "page" then
        handlePage(msg)
    else if kind = "play" then
        beginPlayback(msg)
    else if kind = "playFailed" then
        m.playing = false
        m.playFailed = true
        m.playOverlay.visible = true
        m.playStatus.text = "Cannot play that video."
    else if kind = "server" then
        m.baseUrl = msg.baseUrl
        m.allowInsecure = msg.allowInsecure
        m.defaultBaseUrl = msg.defaultBaseUrl
        showServer()
        selectMode(m.mode, m.query)
    end if
end sub

sub showServer()
    if m.allowInsecure then
        m.serverLabel.text = m.baseUrl + "    (certificate checks disabled)"
    else
        m.serverLabel.text = m.baseUrl
    end if
end sub

' ------------------------------------------------------------------ paging

sub selectMode(mode as String, query as String)
    m.tabIndex = modeToTab(mode)
    paintTabs()
    if m.ready and m.mode = mode and m.query = query and m.items.Count() > 0 then
        focusGrid()
        return
    end if
    m.mode = mode
    m.query = query
    m.items = NewArray()
    m.seen = {}
    m.page = 1
    m.exhausted = false
    m.loading = false
    m.content = CreateObject("roSGNode", "ContentNode")
    m.grid.content = m.content
    m.statusLabel.text = ""
    requestPage(1)
end sub

sub requestPage(page as Integer)
    if m.loading or m.exhausted then
        return
    end if
    m.loading = true
    m.reqId = m.reqId + 1
    m.statusLabel.text = "Loading..."
    request = {
        type: "loadPage",
        mode: m.mode,
        page: page,
        reqId: m.reqId
    }
    if m.mode = "search" then
        request.query = m.query
    end if
    m.top.apiRequest = request
end sub

sub handlePage(msg)
    if msg.reqId <> m.reqId then
        ' A reply to a request we already gave up on.
        return
    end if
    m.loading = false
    if not msg.ok then
        m.statusLabel.text = describeFailure(msg)
        return
    end if
    if type(msg.items) <> "roArray" then
        m.exhausted = true
    else
        added = appendItems(msg.items)
        ' A short page, or a page of nothing new, means the end of the list.
        if msg.items.Count() = 0 or added = 0 then
            m.exhausted = true
        end if
        m.page = msg.page
    end if
    if m.items.Count() = 0 then
        m.statusLabel.text = emptyText()
    else
        m.statusLabel.text = pluralize(m.items.Count(), "video")
    end if
    ' Hand the focus to the grid when nothing else wants it. Two cases: the
    ' first page after show(), when the focus chain did not exist yet during
    ' init(), and a mode the user picked off the tab bar. The focusedTab()
    ' guard is what stops a prefetch page from yanking the focus back down
    ' while the user is walking the tab bar.
    if m.items.Count() > 0 and not m.grid.hasFocus() and focusedTab() < 0 then
        focusGrid()
    end if
    ' A page can arrive while focus is already sitting on the new last row, and
    ' no further focus event will fire to ask for the next one. Without this the
    ' list simply stops growing there.
    if not m.exhausted and m.items.Count() > 0 and m.grid.itemFocused >= m.items.Count() - m.lookahead then
        requestPage(m.page + 1)
    end if
end sub

' Ids are de-duplicated rather than trusted. The server sorts on
' (publishedAt, videoId) so pages should not overlap, but a video that moves
' between pages while we are paging is exactly the case that would otherwise
' show up twice.
function appendItems(newItems as Object) as Integer
    added = 0
    for each item in newItems
        if type(item) = "roAssociativeArray" and m.seen.DoesExist(item.id) = false then
            m.seen[item.id] = true
            m.items.Push(item)
            addGridChild(item)
            added = added + 1
        end if
    end for
    return added
end function

' Appended to the live content node rather than rebuilt, so focus and scroll
' position survive paging.
'
' The poster bindings are hdGridPosterUrl / sdGridPosterUrl, each falling back to
' its non-grid twin when empty; the two caption lines are
' shortDescriptionLine1 and shortDescriptionLine2. Getting these names wrong is
' silent - a ContentNode accepts any field you set, so a typo renders an empty
' grid item rather than raising anything.
sub addGridChild(item as Object)
    child = m.content.createChild("ContentNode")
    ' Deliberately NOT item.thumbnail. That field is an https://i.ytimg.com
    ' URL, and the grid fetches poster images itself with settings the app
    ' cannot influence - there is no certificate knob for it. This firmware
    ' fails the TLS handshake to ytimg outright (getResponseCode() = -35,
    ' "TLS connect error: error:0A000126"), so every poster comes back empty
    ' and the grid renders as bare captions. The same reason video segments go
    ' through /api/m3u8/.../proxy: the device only ever talks plain HTTP to the
    ' local server, and the server does the fetching. The id is enough to
    ' rebuild the URL, so item.thumbnail is never needed.
    poster = m.baseUrl + "/api/thumb/" + item.id
    child.hdGridPosterUrl = poster
    child.sdGridPosterUrl = poster
    child.hdPosterUrl = poster
    child.sdPosterUrl = poster
    child.shortDescriptionLine1 = firstNonEmpty(item.title, item.id)
    child.shortDescriptionLine2 = firstNonEmpty(item.channelName, "")
end sub

sub onItemFocused()
    index = m.grid.itemFocused
    if index < 0 or index >= m.items.Count() then
        return
    end if
    if index >= m.items.Count() - m.lookahead then
        requestPage(m.page + 1)
    end if
end sub

sub onItemSelected()
    index = m.grid.itemSelected
    if index < 0 or index >= m.items.Count() then
        return
    end if
    ' Captured for beginPlayback: see the comment there.
    m.playChosen = m.items[index]
    ' The watch is recorded by the main thread as part of this one request, so
    ' it happens exactly once no matter how many playback attempts follow.
    m.top.apiRequest = { type: "play", videoId: m.items[index].id }
end sub

' ------------------------------------------------------------------ tab bar

' Activating a tab switches mode and hands the focus back to the grid. The
' focus has to move HERE rather than waiting for the next page: handlePage()
' only claims the focus when nothing else holds it, and until this line the
' tab bar does.
sub selectTab(index as Integer)
    if index = 2 then
        ' The keyboard claims the focus itself and gives it back in
        ' onKeyboardClosed; focusing the grid underneath it would just be undone.
        openSearchPrompt()
        return
    end if
    if index = 1 then
        selectMode("pins", "")
    else
        selectMode("videos", "")
    end if
    focusGrid()
end sub

' Index of the tab holding the key focus, or -1. Computed on demand rather
' than cached: hasFocus() is the truth, there are three nodes to ask, and a
' stale cached answer here is what made the old LabelList unusable.
function focusedTab() as Integer
    if m.tabs = invalid or m.tabNodes = invalid then
        return -1
    end if
    ' Cheap reject first: isInFocusChain() is false unless the tabs Group or
    ' something inside it has focus, so the loop below is the rare path.
    if not m.tabs.isInFocusChain() then
        return -1
    end if
    for i = 0 to m.tabNodes.Count() - 1
        if m.tabNodes[i].hasFocus() then
            return i
        end if
    end for
    return -1
end function

sub onTabFocusChanged()
    paintTabs()
end sub

' Every deliberate move of the focus onto the grid goes through here, and
' repaints the tab bar with it. The focusedChild observer would cover most of
' these on its own, but the tab bar's correctness should not rest on a
' notification whose firing conditions are not spelled out - the label colors
' are two assignments, and repainting is idempotent.
sub focusGrid()
    m.grid.setFocus(true)
    paintTabs()
end sub

' The same for a tab, wrapping rather than clamping: three tabs in a strip
' wrap, which is what the Roku home screen does with its channel row and what
' a user arrowing along a bar expects.
sub focusTab(index as Integer)
    count = m.tabNodes.Count()
    m.tabNodes[((index mod count) + count) mod count].setFocus(true)
    paintTabs()
end sub

' Repaints the tab bar. The accent underline (tabMarker) marks the SELECTED
' tab and text brightness marks the tab that has the key focus - two
' indicators because they are two different things: the user arrows onto a
' tab before committing to it with OK, and until they do, "where am I" and
' "what am I looking at" are not the same answer.
'
' The two literals are the primary and dim tiers from the palette comment in
' components/MainScene.xml, repeated because BrightScript has no constant
' scope shared between files - source/config.bs re-sends its constants to this
' component for the same reason. Both are 0xRRGGBBAA, alpha LAST, and both
' are written as STRINGS: a color literal above 0x7FFFFFFF does not fit a
' BrightScript Integer, and a string is what an roSGNode color field accepts.
sub paintTabs()
    if m.tabs = invalid or m.tabNodes = invalid then
        print("DEBUG invalid tabs")
        return
    end if
    focused = focusedTab()
    for i = 0 to m.tabNodes.Count() - 1
        if i = focused then
            m.tabNodes[i].color = "0xC0CAF5FF"
        else
            m.tabNodes[i].color = "0x9AA5CEFF"
        end if
    end for
    if m.tabMarker <> invalid then
        ' NOT an array literal. `offset = [x, y]` is a BrighterScript extension
        ' that is NOT transpiled in a .brs file, so it would reach the device
        ' verbatim as a parse error - the same trap as NewArray() below, and
        ' the marker would then never move at all.
        offset = CreateObject("roArray", 2, false)
        offset[0] = m.tabIndex * TabWidth()
        offset[1] = TabMarkerY()
        m.tabMarker.translation = offset
    end if
end sub

' ------------------------------------------------------------------ dialogs

' The keyboard used to be a roKeyboardScreen, created and shown on the main
' thread. That component is GONE, not merely discouraged: it is on Roku's
' "Deprecated Components: January 1, 2018" list, and the whole set of SDK1
' visual screen components was removed from the firmware in Roku OS 11.5
' (September 2022). On this device - OS 15.3.4 - CreateObject("roKeyboardScreen")
' returns invalid, and it fails quietly: CreateObject does not raise, the
' `if keyboard = invalid` guard in the old main.bs just returned a cancelled
' result, and pressing * or Options did nothing at all with nothing logged.
'
' StandardKeyboardDialog is the supported replacement and takes the same three
' inputs - title, text, buttons - so it is a straight swap. It also brings
' voice entry, which roKeyboardScreen never had.
'
' It lives HERE rather than on the main thread because a dialog is a NODE: it
' joins this scene's tree through the Scene's `dialog` field and reports back
' through field observers. There is no blocking Show() to wrap, which is
' exactly what forced the old code onto the main thread, and nothing to send
' over apiRequest. The main thread is involved only afterwards, for the server
' URL the dialog ended up choosing - the one thing that needs the registry.
sub openKeyboard(purpose as String, title as String, initial as String, buttons as Object)
    ' Two prompts cannot be up at once: a second keypress would otherwise
    ' replace the first dialog and silently discard what was half-typed into it.
    if m.dialog <> invalid then
        return
    end if
    dlg = CreateObject("roSGNode", "StandardKeyboardDialog")
    if dlg = invalid then
        print "could not create a StandardKeyboardDialog"
        return
    end if
    dlg.title = title
    dlg.text = initial
    dlg.buttons = buttons
    ' Three observers, none of which does the work on its own.
    '   buttonSelected  a button was pressed. Does NOT close the dialog.
    '   text            the entered string, mirrored into m.dialogText.
    '   wasClosed       the one place the teardown and the follow-on happen.
    ' `close` is WRITE_ONLY and dismisses on any value, so the button handler
    ' has to set it - the standard dialog framework sample's own pattern.
    ' Reading `text` and `buttonSelected` in the close handler instead would be
    ' shorter and is not done: the node is being torn down when wasClosed
    ' fires, which is the one moment guaranteed not to be a good time to read
    ' its fields. Hence the mirror.
    dlg.observeFieldScoped("buttonSelected", "onKeyboardButton")
    dlg.observeFieldScoped("text", "onKeyboardText")
    dlg.observeFieldScoped("wasClosed", "onKeyboardClosed")
    m.dialog = dlg
    m.dialogPurpose = purpose
    m.dialogText = initial
    m.dialogButton = -1
    m.dialogDismissed = false
    ' Where the key focus was, so it can go back there rather than always
    ' landing on the grid: the search prompt is opened from the tab bar, and
    ' putting the focus on the grid instead would move the highlight off the
    ' tab the user is standing on.
    m.dialogTab = focusedTab()
    m.top.dialog = dlg
end sub

sub openSearchPrompt()
    openKeyboard("search", "Search videos", m.query, SearchButtons())
end sub

sub openServerPrompt()
    openKeyboard("server", "Server address", m.baseUrl, ServerButtons())
end sub

sub onKeyboardButton()
    ' Clears a possibly stale dismissal flag. Options is documented to dismiss
    ' the dialog, but on a dynamic keyboard it can also be voice entry, in
    ' which case the dialog is still up - and a flag left set would turn the
    ' next real commit into a cancellation.
    m.dialogDismissed = false
    m.dialogButton = m.dialog.buttonSelected
    m.dialog.close = true
end sub

sub onKeyboardText()
    m.dialogText = m.dialog.text
end sub

sub onKeyboardClosed()
    ' Every value read here is a plain m.* field, never a node field: the dialog
    ' is on its way out.
    text = m.dialogText
    button = m.dialogButton
    purpose = m.dialogPurpose
    dismissed = m.dialogDismissed
    m.dialog = invalid
    m.dialogPurpose = ""
    m.dialogText = ""
    m.dialogButton = -1
    m.dialogDismissed = false

    ' A dismissal has nothing to undo. Back, Home and Options close the dialog
    ' themselves, and neither prompt has a Cancel button, so backing out of
    ' either one means leaving the query and the server address as they were.
    ' (roKeyboardScreen had a Cancel button, which is where the old
    ' promptCancelled result came from.)
    if not dismissed then
        if purpose = "search" then
            if Len(text) > 0 then
                selectMode("search", text)
            end if
        else
            handleServerPrompt(button, text)
        end if
    end if
    restoreFocus()
end sub

' button indexes the buttons array, and is -1 when the dialog was committed
' without one. That is what the keyboard's own OK key does - it is documented to
' dismiss the dialog, and NOT documented to set buttonSelected - and it is also
' what the old roKeyboardScreen reported through getSelectedIndex(). -1 is not
' 1, so it takes the Save path, which is the right answer either way: the text
' is what the user typed.
sub handleServerPrompt(button as Integer, text as String)
    ' ["Save", "Reset"]: 0 keeps what was typed, 1 throws it away and goes back
    ' to the compiled-in default. The main thread is the only scope that can
    ' reach the registry, so even a reset travels as an ordinary save.
    if button = 1 then
        m.top.apiRequest = { type: "saveServer", url: "", allowInsecure: m.allowInsecure }
    else if Len(text) > 0 then
        m.top.apiRequest = { type: "saveServer", url: text, allowInsecure: m.allowInsecure }
    end if
end sub

' Three cases, not one. The grid is the common answer, but the tab bar is where
' a search prompt was opened from, and while a video is playing the server
' prompt can be opened from the playing branch of onKeyEvent - where the grid
' is inside the hidden browseGroup and focusing it would leave the key focus on
' an invisible node with the Video no longer receiving trick play.
sub restoreFocus()
    if m.playing then
        m.video.setFocus(true)
    else if m.dialogTab >= 0 then
        focusTab(m.dialogTab)
    else
        focusGrid()
    end if
    m.dialogTab = -1
end sub

' NOT array literals. `["Save", "Reset"]` is a BrighterScript extension and it
' is NOT transpiled in a .brs file, so it reaches the device verbatim and the
' VM rejects the file with a parse error - the same trap as NewArray() and the
' tabMarker translation. One button for search rather than none: the dialog
' commits through its button area, and an empty one would leave nothing to
' commit with if the keyboard's own OK key turns out not to.
function SearchButtons() as Object
    buttons = NewArray()
    buttons.Push("Search")
    return buttons
end function

function ServerButtons() as Object
    buttons = NewArray()
    buttons.Push("Save")
    buttons.Push("Reset")
    return buttons
end function

' ---------------------------------------------------------------- playback

sub beginPlayback(msg)
    m.playlistUrl = msg.playlistUrl
    m.playAttempts = msg.playbackAttempts
    m.playAttempt = 0
    m.playFailed = false
    m.playing = true
    m.browseGroup.visible = false
    m.tabs.visible = false
    m.serverLabel.visible = false
    m.statusLabel.visible = false
    m.hintLabel.visible = false
    m.playGroup.visible = true
    ' The title and channel have to be captured here: by the time the first
    ' roUrlEvent lands the browse grid is hidden, and itemSelected is not
    ' trustworthy once focus has moved to the Video node.
    chosen = m.playChosen
    m.playTitle.text = firstNonEmpty(chosen.title, firstNonEmpty(chosen.id, ""))
    m.playChannel = firstNonEmpty(chosen.channelName, "")
    m.showTicks = 0
    m.overlayShowing = true
    m.playOverlay.visible = true
    startAttempt()
end sub

sub startAttempt()
    content = CreateObject("roSGNode", "ContentNode")
    content.url = m.playlistUrl
    content.streamFormat = "hls"
    m.video.content = content
    m.playAttempt = m.playAttempt + 1
    m.playOverlay.visible = true
    m.playStatus.text = "Starting stream...  (attempt " + NumStr(m.playAttempt) + " of " + NumStr(m.playAttempts) + ")"
    ' Stop is synchronous here (asyncStopSemantics is left off), so a fresh
    ' "play" is always safe to issue from this callback.
    m.video.control = "play"
    m.video.setFocus(true)
end sub

' The node's state is sampled rather than observed: a component script must not
' block, and 500ms is well inside the window where a user notices nothing.
sub sampleVideoState()
    if not m.playing then
        return
    end if
    state = m.video.state
    if state = "playing" then
        ' Stay up while playing, then get out of the way. Hiding the overlay the
        ' instant state flips to "playing" is what left the player looking like
        ' it had no UI: the title and status were only ever on screen during the
        ' sub-second buffer, and playback then covered them.
        m.playStatus.text = firstNonEmpty(m.playChannel, "") + "        OK info        back exit"
        m.showTicks = OverlayTicks()
        if not m.overlayShowing then
            m.overlayShowing = true
            m.playOverlay.visible = true
        end if
    else if state = "buffering" or state = "none" then
        m.playOverlay.visible = true
        m.overlayShowing = true
        m.showTicks = 0
        m.playStatus.text = "Buffering..."
    else if state = "finished" then
        endPlayback()
        return
    else if state = "error" then
        if m.playAttempt < m.playAttempts then
            ' The signed proxy URL inside the master playlist has expired.
            ' Re-requesting the same URL mints fresh tokens, which is all a
            ' retry needs - no new request from here.
            startAttempt()
            return
        else
            m.playFailed = true
            m.overlayShowing = true
            m.showTicks = 0
            m.playOverlay.visible = true
            m.playStatus.text = "Playback failed: " + firstNonEmpty(m.video.errorMsg, "unknown error")
        end if
    end if

    ' Auto-hide, counted down in Timer ticks (0.5s each) rather than seconds so
    ' it needs no second timer.
    if m.showTicks > 0 then
        m.showTicks = m.showTicks - 1
        if m.showTicks = 0 and m.video.state = "playing" then
            m.overlayShowing = false
            m.playOverlay.visible = false
        end if
    end if
end sub

sub endPlayback()
    m.video.control = "stop"
    m.video.content = invalid
    m.playing = false
    m.playFailed = false
    m.playGroup.visible = false
    ' Explicit, because playOverlay is a top-level node and no longer inherits
    ' playGroup's visibility. Forgetting this leaves the scrim and labels drawn
    ' over the browse grid.
    m.playOverlay.visible = false
    m.overlayShowing = false
    m.showTicks = 0
    m.browseGroup.visible = true
    m.tabs.visible = true
    m.serverLabel.visible = true
    m.statusLabel.visible = true
    m.hintLabel.visible = true
    focusGrid()
end sub

' --------------------------------------------------------------------- keys

function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then
        return false
    end if

    ' A standard dialog dismisses itself on Back, Home and Options, and
    ' onKeyEvent is asked BEFORE the focused node is, so anything returned here
    ' would swallow those keys and leave the keyboard stuck open with no way
    ' out. Back is not special-cased anywhere below for exactly this reason.
    '
    ' The three keys are flagged rather than handled: the dialog closes itself,
    ' so all this has to do is remember that the close was a dismissal and not
    ' a commit. onKeyboardButton() clears the flag again if the dialog turns
    ' out to still be up.
    if m.dialog <> invalid then
        if key = "back" or key = "home" or key = "options" then
            m.dialogDismissed = true
        end if
        return false
    end if

    if m.playing then
        if key = "back" or (key = "ok" and m.playFailed) then
            endPlayback()
            return true
        end if
        if key = "options" then
            openServerPrompt()
            return true
        end if
        ' Any other key falls through to the Video node, which wants OK for
        ' trick play. But if the overlay has auto-hidden, the keypress that
        ' brought it back is swallowed by the Video instead, so the info has to
        ' be re-shown here rather than relying on the key reaching anyone.
        if not m.overlayShowing and m.video.state = "playing" then
            m.overlayShowing = true
            m.playOverlay.visible = true
            m.playStatus.text = firstNonEmpty(m.playChannel, "") + "        OK info        back exit"
            m.showTicks = OverlayTicks()
        end if
        return false
    end if

    ' The tab bar, first: whenever a tab holds the focus these keys mean the
    ' tab bar. All four are handled here rather than left to the focus chain.
    ' The chain would get left/right on its own - the three Labels sit side by
    ' side - but ok and down it would not, and ok is the whole point. Doing
    ' all four explicitly also means the wrap is ours: a list would have
    ' scrolled a one-row viewport instead, which is the bug this replaced.
    ' (The local is not called `tab`: that is a BrightScript builtin.)
    focused = focusedTab()
    if focused >= 0 then
        if key = "ok" then
            selectTab(focused)
            return true
        else if key = "down" or key = "back" then
            ' Back from the tab bar goes to the grid, not out of the channel:
            ' the tab bar is a child of the browser, not a screen of its own.
            focusGrid()
            return true
        else if key = "right" then
            focusTab(focused + 1)
            return true
        else if key = "left" then
            focusTab(focused - 1)
            return true
        end if
    else if key = "up" and m.grid.hasFocus() then
        ' Up from the grid's FIRST row goes to the tab bar, which is the only
        ' focusable thing above the grid. Any other row keeps normal grid
        ' navigation, which is why this tests the row rather than the key.
        if m.grid.itemFocused < m.grid.numColumns then
            focusTab(m.tabIndex)
            return true
        end if
    end if

    if key = "back" then
        if m.mode <> "videos" then
            selectMode("videos", "")
            return true
        end if
        return false
    else if key = "options" then
        openServerPrompt()
        return true
    else if key = "search" then
        openSearchPrompt()
        return true
    else if key = "play" then
        selectTab(1)
        return true
    end if
    return false
end function

' ------------------------------------------------------------------ helpers

' Roku's BrightScript has no `[]` array-literal syntax. That is a BrighterScript
' extension, and it is NOT transpiled - not in a .bs file and not in a .brs file -
' so a literal reaches the device verbatim and is a runtime parse error. The
' equivalent is an empty growable roArray.
'
' Note that `{ }` is fine: associative-array literals ARE part of BrightScript.
' Do not "simplify" the CreateObject calls below back into [].
function NewArray() as Object
    return CreateObject("roArray", 0, true)
end function

function modeToTab(mode as String) as Integer
    if mode = "pins" then
        return 1
    end if
    if mode = "search" then
        return 2
    end if
    return 0
end function

function emptyText() as String
    if m.mode = "pins" then
        return "Nothing pinned yet."
    else if m.mode = "search" then
        return "No matches for """ + m.query + """."
    end if
    return "No videos yet."
end function

function describeFailure(msg) as String
    if msg.reason = "http_error" then
        if msg.status = 404 then
            return "Server said 404 - is " + m.baseUrl + " correct?"
        end if
        return "Server said HTTP " + NumStr(msg.status)
    else if msg.reason = "invalid_response" then
        return m.baseUrl + " did not return a video list."
    else if msg.reason = "busy" then
        return "Still waiting on the previous request."
    end if
    return "Could not reach " + m.baseUrl + "  (press options to change it)"
end function

function firstNonEmpty(value as Dynamic, fallback as String) as String
    if value = invalid then
        return fallback
    end if
    text = ""
    valueType = type(value)
    if valueType = "String" or valueType = "roString" then
        text = value
    else if valueType = "Integer" or valueType = "roInt" or valueType = "Float" or valueType = "roFloat" or valueType = "Double" or valueType = "roDouble" then
        text = NumStr(value)
    end if
    if Len(text) = 0 then
        return fallback
    end if
    return text
end function

function pluralize(count as Integer, noun as String) as String
    if count = 1 then
        return "1 " + noun
    end if
    return NumStr(count) + " " + noun + "s"
end function

' Numbers to strings WITHOUT .toStr(). BrighterScript implements toStr() by
' wrapping the value in an roString and calling a method this firmware does not
' have, which is a runtime error (&hf4) rather than a no-op. Str() is native but
' prefixes positive numbers with a space, hence the strip below.
' Trim() itself is not declared for BrighterScript, hence not used here either.
function NumStr(value as Dynamic) as String
    text = Str(value)
    if Len(text) > 0 and Left(text, 1) = " " then
        return Mid(text, 2)
    end if
    return text
end function
