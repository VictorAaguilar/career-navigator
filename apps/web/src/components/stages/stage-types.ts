import type { Dispatch, RefObject } from "react";
import type { TailoringDemoAction, TailoringDemoState } from "../../app/tailoring-demo-state";
import type { WorkflowStage } from "../../app/workflow-stages";

export type DemoDispatch = Dispatch<TailoringDemoAction>;

export type StageComponentProps = {
  state: TailoringDemoState;
  dispatch: DemoDispatch;
};

export type StageHeaderProps = {
  stage: WorkflowStage;
  titleRef: RefObject<HTMLHeadingElement | null>;
};
