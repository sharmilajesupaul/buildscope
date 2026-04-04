package main

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const defaultReleaseRepo = "sharmilajesupaul/buildscope"

func updateCommand(args []string) error {
	fs := flag.NewFlagSet("update", flag.ExitOnError)
	versionFlag := fs.String("version", "latest", "release tag to install, or latest")
	repoFlag := fs.String("repo", defaultReleaseRepo, "GitHub repo that publishes BuildScope release archives")
	_ = fs.Parse(normalizeFlagArgs(args))

	if fs.NArg() != 0 {
		return fmt.Errorf("usage: buildscope update [-version latest|v0.1.9] [-repo owner/name]")
	}

	targetPath, homebrewManaged, err := resolveUpdateTargetPath()
	if err != nil {
		return err
	}

	requestedVersion := normalizeRequestedVersion(*versionFlag)
	if requestedVersion == version && version != "dev" {
		fmt.Printf("buildscope %s is already installed at %s\n", version, targetPath)
		return nil
	}

	if homebrewManaged {
		return updateWithHomebrew(requestedVersion)
	}

	targetVersion, err := resolveRequestedVersion(*repoFlag, requestedVersion)
	if err != nil {
		return err
	}
	if targetVersion == version && version != "dev" {
		fmt.Printf("buildscope %s is already installed at %s\n", version, targetPath)
		return nil
	}

	assetName, err := releaseArchiveAssetName(runtime.GOOS, runtime.GOARCH)
	if err != nil {
		return err
	}

	tempDir, err := os.MkdirTemp("", "buildscope-update-*")
	if err != nil {
		return fmt.Errorf("create temp dir: %w", err)
	}
	defer os.RemoveAll(tempDir)

	archivePath := filepath.Join(tempDir, assetName)
	downloadURL := releaseArchiveDownloadURL(*repoFlag, targetVersion, assetName)
	if err := downloadReleaseArchive(downloadURL, archivePath); err != nil {
		return err
	}

	binaryPath, err := extractReleaseBinary(archivePath, tempDir)
	if err != nil {
		return err
	}

	if err := replaceExecutable(binaryPath, targetPath); err != nil {
		return err
	}

	fmt.Printf("Updated buildscope to %s at %s\n", targetVersion, targetPath)
	return nil
}

func normalizeRequestedVersion(version string) string {
	trimmed := strings.TrimSpace(version)
	if trimmed == "" {
		return "latest"
	}
	if trimmed == "latest" || strings.HasPrefix(trimmed, "v") {
		return trimmed
	}
	if trimmed[0] >= '0' && trimmed[0] <= '9' {
		return "v" + trimmed
	}
	return trimmed
}

func resolveRequestedVersion(repo, requested string) (string, error) {
	if requested != "" && requested != "latest" {
		return requested, nil
	}
	return latestReleaseTag(repo)
}

func resolveUpdateTargetPath() (string, bool, error) {
	executablePath, err := os.Executable()
	if err != nil {
		return "", false, fmt.Errorf("resolve current executable: %w", err)
	}

	resolvedPath := executablePath
	if evaluatedPath, err := filepath.EvalSymlinks(executablePath); err == nil {
		resolvedPath = evaluatedPath
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		return "", false, fmt.Errorf("stat current executable: %w", err)
	}
	if !info.Mode().IsRegular() {
		return "", false, fmt.Errorf("current executable is not a regular file: %s", resolvedPath)
	}

	return resolvedPath, isHomebrewManagedPath(resolvedPath), nil
}

func isHomebrewManagedPath(path string) bool {
	normalized := filepath.ToSlash(path)
	return strings.Contains(normalized, "/Cellar/buildscope/") ||
		strings.Contains(normalized, "/Homebrew/Cellar/buildscope/")
}

func updateWithHomebrew(requestedVersion string) error {
	if requestedVersion != "" && requestedVersion != "latest" {
		return fmt.Errorf("version-pinned updates are unsupported for Homebrew-managed installs; use brew to install %s explicitly", requestedVersion)
	}

	if _, err := exec.LookPath("brew"); err != nil {
		return fmt.Errorf("buildscope appears Homebrew-managed, but brew is not available in PATH")
	}

	cmd := exec.Command("brew", "upgrade", "sharmilajesupaul/buildscope/buildscope")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("brew upgrade failed: %w", err)
	}
	return nil
}

func releaseArchiveAssetName(goos, goarch string) (string, error) {
	switch goos {
	case "darwin", "linux":
	default:
		return "", fmt.Errorf("automatic updates are unsupported on %s", goos)
	}

	switch goarch {
	case "amd64", "arm64":
	default:
		return "", fmt.Errorf("automatic updates are unsupported on %s", goarch)
	}

	return fmt.Sprintf("buildscope_%s_%s.tar.gz", goos, goarch), nil
}

func releaseArchiveDownloadURL(repo, tag, assetName string) string {
	return fmt.Sprintf("https://github.com/%s/releases/download/%s/%s", repo, tag, assetName)
}

func latestReleaseTag(repo string) (string, error) {
	request, err := newGitHubRequest(fmt.Sprintf("https://api.github.com/repos/%s/releases?per_page=1", repo))
	if err != nil {
		return "", err
	}

	client := &http.Client{Timeout: 30 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return "", fmt.Errorf("fetch latest release for %s: %w", repo, err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 512))
		return "", fmt.Errorf("fetch latest release for %s: %s", repo, strings.TrimSpace(string(body)))
	}

	tag, err := latestReleaseTagFromJSON(response.Body)
	if err != nil {
		return "", err
	}
	return tag, nil
}

func latestReleaseTagFromJSON(reader io.Reader) (string, error) {
	var releases []struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(reader).Decode(&releases); err != nil {
		return "", fmt.Errorf("decode GitHub releases response: %w", err)
	}
	if len(releases) == 0 || strings.TrimSpace(releases[0].TagName) == "" {
		return "", fmt.Errorf("no releases found")
	}
	return strings.TrimSpace(releases[0].TagName), nil
}

func githubAuthToken() string {
	for _, key := range []string{"BUILDSCOPE_GITHUB_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"} {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return ""
}

func newGitHubRequest(url string) (*http.Request, error) {
	request, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	if token := githubAuthToken(); token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	return request, nil
}

func downloadReleaseArchive(url, destination string) error {
	request, err := newGitHubRequest(url)
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: 2 * time.Minute}
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("download release archive: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 512))
		return fmt.Errorf("download release archive: %s", strings.TrimSpace(string(body)))
	}

	output, err := os.Create(destination)
	if err != nil {
		return fmt.Errorf("create archive file: %w", err)
	}
	defer output.Close()

	if _, err := io.Copy(output, response.Body); err != nil {
		return fmt.Errorf("write archive file: %w", err)
	}
	return nil
}

func extractReleaseBinary(archivePath, destinationDir string) (string, error) {
	archiveFile, err := os.Open(archivePath)
	if err != nil {
		return "", fmt.Errorf("open archive: %w", err)
	}
	defer archiveFile.Close()

	gzipReader, err := gzip.NewReader(archiveFile)
	if err != nil {
		return "", fmt.Errorf("open gzip stream: %w", err)
	}
	defer gzipReader.Close()

	tarReader := tar.NewReader(gzipReader)
	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", fmt.Errorf("read tar archive: %w", err)
		}
		if header.Typeflag != tar.TypeReg {
			continue
		}
		if filepath.Base(header.Name) != "buildscope" {
			continue
		}

		extractedPath := filepath.Join(destinationDir, "buildscope")
		output, err := os.OpenFile(extractedPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
		if err != nil {
			return "", fmt.Errorf("create extracted binary: %w", err)
		}
		if _, err := io.Copy(output, tarReader); err != nil {
			output.Close()
			return "", fmt.Errorf("write extracted binary: %w", err)
		}
		if err := output.Close(); err != nil {
			return "", fmt.Errorf("close extracted binary: %w", err)
		}
		return extractedPath, nil
	}

	return "", fmt.Errorf("release archive did not contain a buildscope binary")
}

func replaceExecutable(sourcePath, targetPath string) error {
	targetInfo, err := os.Stat(targetPath)
	if err != nil {
		return fmt.Errorf("stat target binary: %w", err)
	}

	destinationDir := filepath.Dir(targetPath)
	tempOutput, err := os.CreateTemp(destinationDir, ".buildscope-update-*")
	if err != nil {
		return fmt.Errorf("create temp binary: %w", err)
	}
	tempPath := tempOutput.Name()

	copySucceeded := false
	defer func() {
		if !copySucceeded {
			_ = os.Remove(tempPath)
		}
	}()

	sourceFile, err := os.Open(sourcePath)
	if err != nil {
		tempOutput.Close()
		return fmt.Errorf("open extracted binary: %w", err)
	}
	defer sourceFile.Close()

	if _, err := io.Copy(tempOutput, sourceFile); err != nil {
		tempOutput.Close()
		return fmt.Errorf("copy updated binary: %w", err)
	}
	if err := tempOutput.Chmod(targetInfo.Mode()); err != nil {
		tempOutput.Close()
		return fmt.Errorf("set updated binary mode: %w", err)
	}
	if err := tempOutput.Close(); err != nil {
		return fmt.Errorf("close temp binary: %w", err)
	}

	if err := os.Rename(tempPath, targetPath); err != nil {
		return fmt.Errorf("replace current binary: %w", err)
	}

	copySucceeded = true
	return nil
}
