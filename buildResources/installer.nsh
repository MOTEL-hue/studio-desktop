; סמל נפרד לאולפן ההקלטות (בשולחן העבודה ובתפריט התחל): אותה תוכנה, שנפתחת ישר באולפן ההקלטות
!macro customInstall
  CreateShortCut "$DESKTOP\אולפן הקלטות.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--music" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  CreateShortCut "$SMPROGRAMS\אולפן הקלטות.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--music" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
!macroend

!macro customUnInstall
  Delete "$DESKTOP\אולפן הקלטות.lnk"
  Delete "$SMPROGRAMS\אולפן הקלטות.lnk"
!macroend
