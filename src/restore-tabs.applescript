on run argv
    tell application "Terminal"
        activate
        repeat with i from 1 to count of argv
            set cmd to item i of argv
            if i = 1 then
                do script cmd
            else
                tell application "System Events" to keystroke "t" using command down
                delay 0.4
                do script cmd in front window
            end if
        end repeat
    end tell
end run
