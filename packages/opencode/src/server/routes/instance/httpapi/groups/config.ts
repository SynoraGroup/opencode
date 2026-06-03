import { Config } from "@/config/config"
import { Provider } from "@/provider/provider"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/config"

export const ConfigApi = HttpApi.make("config")
  .add(
    HttpApiGroup.make("config")
      .add(
        HttpApiEndpoint.get("get", root, {
          query: WorkspaceRoutingQuery,
          success: described(Config.Info, "Get config info"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "config.get",
            summary: "Get configuration",
            description: "Retrieve the current local Synora harness configuration settings and preferences.",
          }),
        ),
        HttpApiEndpoint.patch("update", root, {
          query: WorkspaceRoutingQuery,
          payload: Config.Info,
          success: described(Config.Info, "Successfully updated config"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "config.update",
            summary: "Update configuration",
            description: "Update local Synora harness configuration settings and preferences.",
          }),
        ),
        HttpApiEndpoint.get("providers", `${root}/providers`, {
          query: WorkspaceRoutingQuery,
          success: described(Provider.ConfigProvidersResult, "List of providers"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "config.providers",
            summary: "List config providers",
            description: "Get the approved Synora providers and their default models from the current configuration.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "config",
          description: "Instance configuration routes.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "synora instance HttpApi",
      version: "0.0.1",
      description: "Private HttpApi surface for the local Synora instance.",
    }),
  )
