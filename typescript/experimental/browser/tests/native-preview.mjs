import { API } from "typescript/sync";
import { createFileSystem } from "typescript/fs";
import {
    configFileName, createCompiler, jsonFileName, schemaFileName, schemaValidationFileName
} from "../dist/src/ts/compiler.js";
import { createTypeScriptJsonValidatorWithCompiler } from "../dist/src/ts/validation.js";
import { projectView } from "../dist/experimental/browser/src/project.js";

export function createPreviewNativeValidator(schema, typeName, schemaValidationTypeName = typeName) {
    return createTypeScriptJsonValidatorWithCompiler(schema, typeName, schemaValidationTypeName, files => {
        const api = new API({ cwd: "/", useCaseSensitiveFileNames: true });
        let previous;
        return createCompiler({
            writeFile(name, text) {
                files[name] = text;
            },
            update(changedFiles) {
                const next = api.createSnapshot({
                    openFiles: [schemaFileName, jsonFileName, schemaValidationFileName],
                    fileSystem: createFileSystem(Object.entries(files)),
                    fileNotifications: { changed: [...changedFiles], deleted: [] }
                });
                previous?.dispose();
                previous = next;
                const project = next.getConfiguredProject(configFileName);
                return project && projectView(project);
            },
            close: () => api.close()
        });
    });
}
