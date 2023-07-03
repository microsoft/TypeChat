// This is a schema for controlling the source files in a project

export type SourceFile = {
    // The file name of the source file
    fileName: string;
    // Return the text of the source file
    getText(): string;
    // Set the text of the source file
    setText(text: string): void;
    // Save the file to disk
    save(): void;
    // Close the source file
    close(): void;
}

export type Api = {
    // Return the file names of the files in the current project
    getProjectFileNames(): string[];
    // Close project
    closeProject(): void;
    // Open a file
    openFile(fileName: string): SourceFile;
    // Call this function for requests that weren't understood
    unknownAction(text: string): void;
}

export type RequestHandler = (api: Api) => void;
