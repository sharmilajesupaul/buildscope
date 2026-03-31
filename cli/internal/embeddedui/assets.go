package embeddedui

import (
	"embed"
	"io/fs"
)

//go:embed dist/**
var rawAssets embed.FS

var Assets = mustSub(rawAssets, "dist")

func mustSub(src fs.FS, dir string) fs.FS {
	sub, err := fs.Sub(src, dir)
	if err != nil {
		panic(err)
	}
	return sub
}
