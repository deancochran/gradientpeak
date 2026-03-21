import type { Meta, StoryObj } from "@storybook/react";
import { Bell, CircleAlert, LayoutGrid } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import { Alert, AlertDescription, AlertTitle } from "../components/alert/index.native";
import { avatarFixtures } from "../components/avatar/fixtures";
import { Avatar, AvatarFallback } from "../components/avatar/index.native";
import { badgeFixtures } from "../components/badge/fixtures";
import { Badge } from "../components/badge/index.native";
import { boundedNumberInputFixtures } from "../components/bounded-number-input/fixtures";
import { BoundedNumberInput } from "../components/bounded-number-input/index.native";
import { buttonFixtures } from "../components/button/fixtures";
import { Button } from "../components/button/index.native";
import { cardFixtures } from "../components/card/fixtures";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/card/index.native";
import { checkboxFixtures } from "../components/checkbox/fixtures";
import { Checkbox } from "../components/checkbox/index.native";
import { dateInputFixtures } from "../components/date-input/fixtures";
import { DateInput } from "../components/date-input/index.native";
import { durationInputFixtures } from "../components/duration-input/fixtures";
import { DurationInput } from "../components/duration-input/index.native";
import { fileInputFixtures } from "../components/file-input/fixtures";
import { FileInput } from "../components/file-input/index.native";
import { Icon } from "../components/icon/index.native";
import { inputFixtures } from "../components/input/fixtures";
import { Input } from "../components/input/index.native";
import { integerStepperFixtures } from "../components/integer-stepper/fixtures";
import { IntegerStepper } from "../components/integer-stepper/index.native";
import { labelFixtures } from "../components/label/fixtures";
import { Label } from "../components/label/index.native";
import { numberSliderInputFixtures } from "../components/number-slider-input/fixtures";
import { NumberSliderInput } from "../components/number-slider-input/index.native";
import { paceInputFixtures } from "../components/pace-input/fixtures";
import { PaceInput } from "../components/pace-input/index.native";
import { paceSecondsFieldFixtures } from "../components/pace-seconds-field/fixtures";
import { PaceSecondsField } from "../components/pace-seconds-field/index.native";
import { percentSliderInputFixtures } from "../components/percent-slider-input/fixtures";
import { PercentSliderInput } from "../components/percent-slider-input/index.native";
import { Progress } from "../components/progress/index.native";
import { radioGroupFixtures } from "../components/radio-group/fixtures";
import { RadioGroup, RadioGroupItem } from "../components/radio-group/index.native";
import { selectFixtures } from "../components/select/fixtures";
import {
  NativeSelectScrollView,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/select/index.native";
import type { Option } from "../components/select/shared";
import { Separator } from "../components/separator/index.native";
import { Skeleton } from "../components/skeleton/index.native";
import { sliderFixtures } from "../components/slider/fixtures";
import { Slider } from "../components/slider/index.native";
import { switchFixtures } from "../components/switch/fixtures";
import { Switch } from "../components/switch/index.native";
import { tabsFixtures } from "../components/tabs/fixtures";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/tabs/index.native";
import { Text } from "../components/text/index.native";
import { textareaFixtures } from "../components/textarea/fixtures";
import { Textarea } from "../components/textarea/index.native";
import { Toggle } from "../components/toggle/index.native";
import {
  ToggleGroup,
  ToggleGroupIcon,
  ToggleGroupItem,
} from "../components/toggle-group/index.native";
import { weightInputFieldFixtures } from "../components/weight-input-field/fixtures";
import { WeightInputField } from "../components/weight-input-field/index.native";

const meta = {
  title: "Catalog/Native Controls",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function NativeFrame({ children }: { children: React.ReactNode }) {
  return <View className="min-w-[320px] gap-4 bg-background p-6">{children}</View>;
}

export const AlertStory: Story = {
  name: "Alert",
  render: () => (
    <NativeFrame>
      <Alert icon={CircleAlert}>
        <AlertTitle>Sensor unavailable</AlertTitle>
        <AlertDescription>
          Fallback metrics stay visible while hardware reconnects.
        </AlertDescription>
      </Alert>
    </NativeFrame>
  ),
};

export const AvatarStory: Story = {
  name: "Avatar",
  render: () => (
    <NativeFrame>
      <Avatar alt={avatarFixtures.profile.alt} testId={avatarFixtures.profile.testId}>
        <AvatarFallback>{avatarFixtures.profile.fallback}</AvatarFallback>
      </Avatar>
    </NativeFrame>
  ),
};

export const BadgeStory: Story = {
  name: "Badge",
  render: () => (
    <NativeFrame>
      <Badge>{badgeFixtures.featured.children}</Badge>
    </NativeFrame>
  ),
};

export const BoundedNumberInputStory: Story = {
  name: "Bounded Number Input",
  render: () => {
    const [value, setValue] = React.useState<string>(boundedNumberInputFixtures.ftp.value);
    return (
      <NativeFrame>
        <BoundedNumberInput {...boundedNumberInputFixtures.ftp} onChange={setValue} value={value} />
      </NativeFrame>
    );
  },
};

export const ButtonStory: Story = {
  name: "Button",
  render: () => (
    <NativeFrame>
      <Button {...buttonFixtures.continue}>
        <Text>{buttonFixtures.continue.children}</Text>
      </Button>
    </NativeFrame>
  ),
};

export const CardStory: Story = {
  name: "Card",
  render: () => (
    <NativeFrame>
      <Card>
        <CardHeader>
          <CardTitle>{cardFixtures.recoveryCheck.title}</CardTitle>
          <CardDescription>{cardFixtures.recoveryCheck.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Text className="text-sm text-foreground">
            Shared layout primitives stay identical on device.
          </Text>
        </CardContent>
      </Card>
    </NativeFrame>
  ),
};

export const CheckboxStory: Story = {
  name: "Checkbox",
  render: () => {
    const [checked, setChecked] = React.useState(true);
    return (
      <NativeFrame>
        <Checkbox {...checkboxFixtures.terms} checked={checked} onCheckedChange={setChecked} />
      </NativeFrame>
    );
  },
};

export const DateInputStory: Story = {
  name: "Date Input",
  render: () => {
    const [value, setValue] = React.useState<string | undefined>(dateInputFixtures.raceDay.value);
    return (
      <NativeFrame>
        <DateInput {...dateInputFixtures.raceDay} onChange={setValue} value={value} />
      </NativeFrame>
    );
  },
};

export const DurationInputStory: Story = {
  name: "Duration Input",
  render: () => {
    const [value, setValue] = React.useState<string>(durationInputFixtures.workout.value);
    return (
      <NativeFrame>
        <DurationInput {...durationInputFixtures.workout} onChange={setValue} value={value} />
      </NativeFrame>
    );
  },
};

export const FileInputStory: Story = {
  name: "File Input",
  render: () => (
    <NativeFrame>
      <FileInput {...fileInputFixtures.avatar} />
    </NativeFrame>
  ),
};

export const IconStory: Story = {
  name: "Icon",
  render: () => (
    <NativeFrame>
      <View className="flex-row items-center gap-4">
        <Icon as={Bell} className="size-5" />
        <Icon as={CircleAlert} className="size-5 text-destructive" />
      </View>
    </NativeFrame>
  ),
};

export const InputStory: Story = {
  name: "Input",
  render: () => {
    const [value, setValue] = React.useState<string>(inputFixtures.states.value);
    return (
      <NativeFrame>
        <Input {...inputFixtures.email} onChangeText={setValue} value={value} />
      </NativeFrame>
    );
  },
};

export const IntegerStepperStory: Story = {
  name: "Integer Stepper",
  render: () => {
    const [value, setValue] = React.useState<number>(integerStepperFixtures.weeks.value);
    return (
      <NativeFrame>
        <IntegerStepper {...integerStepperFixtures.weeks} onChange={setValue} value={value} />
      </NativeFrame>
    );
  },
};

export const LabelStory: Story = {
  name: "Label",
  render: () => (
    <NativeFrame>
      <Label {...labelFixtures.email}>{labelFixtures.email.children}</Label>
    </NativeFrame>
  ),
};

export const NumberSliderInputStory: Story = {
  name: "Number Slider Input",
  render: () => {
    const [value, setValue] = React.useState<number>(numberSliderInputFixtures.intensity.value);
    return (
      <NativeFrame>
        <NumberSliderInput
          {...numberSliderInputFixtures.intensity}
          onChange={setValue}
          showNumericInput
          value={value}
        />
      </NativeFrame>
    );
  },
};

export const PaceInputStory: Story = {
  name: "Pace Input",
  render: () => {
    const [value, setValue] = React.useState<string>(paceInputFixtures.threshold.value);
    return (
      <NativeFrame>
        <PaceInput {...paceInputFixtures.threshold} onChange={setValue} value={value} />
      </NativeFrame>
    );
  },
};

export const PaceSecondsFieldStory: Story = {
  name: "Pace Seconds Field",
  render: () => {
    const [valueSeconds, setValueSeconds] = React.useState<number | null>(
      paceSecondsFieldFixtures.easy.valueSeconds,
    );
    return (
      <NativeFrame>
        <PaceSecondsField
          {...paceSecondsFieldFixtures.easy}
          onChangeSeconds={setValueSeconds}
          valueSeconds={valueSeconds}
        />
      </NativeFrame>
    );
  },
};

export const PercentSliderInputStory: Story = {
  name: "Percent Slider Input",
  render: () => {
    const [value, setValue] = React.useState<number>(percentSliderInputFixtures.recovery.value);
    return (
      <NativeFrame>
        <PercentSliderInput
          {...percentSliderInputFixtures.recovery}
          onChange={setValue}
          value={value}
        />
      </NativeFrame>
    );
  },
};

export const ProgressStory: Story = {
  name: "Progress",
  render: () => (
    <NativeFrame>
      <Progress value={72} />
    </NativeFrame>
  ),
};

export const RadioGroupStory: Story = {
  name: "Radio Group",
  render: () => {
    const fixture = radioGroupFixtures.sport;
    const [value, setValue] = React.useState<string>(fixture.value);
    return (
      <NativeFrame>
        <RadioGroup onValueChange={setValue} value={value}>
          {fixture.options.map((option) => (
            <View className="flex-row items-center gap-2" key={option.value}>
              <RadioGroupItem value={option.value} />
              <Text>{option.label}</Text>
            </View>
          ))}
        </RadioGroup>
      </NativeFrame>
    );
  },
};

export const SelectStory: Story = {
  name: "Select",
  render: () => {
    const fixture = selectFixtures.workoutType;
    const [value, setValue] = React.useState<Option | undefined>(
      fixture.options.find((option) => option.value === fixture.value),
    );
    return (
      <NativeFrame>
        <Select onValueChange={setValue} value={value}>
          <SelectTrigger>
            <SelectValue placeholder={fixture.placeholder} />
          </SelectTrigger>
          <SelectContent>
            <NativeSelectScrollView>
              {fixture.options.map((option) => (
                <SelectItem key={option.value} label={option.label} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </NativeSelectScrollView>
          </SelectContent>
        </Select>
      </NativeFrame>
    );
  },
};

export const SeparatorStory: Story = {
  name: "Separator",
  render: () => (
    <NativeFrame>
      <Text>Before</Text>
      <Separator />
      <Text>After</Text>
    </NativeFrame>
  ),
};

export const SkeletonStory: Story = {
  name: "Skeleton",
  render: () => (
    <NativeFrame>
      <Skeleton className="h-12 w-48 rounded-md" />
    </NativeFrame>
  ),
};

export const SliderStory: Story = {
  name: "Slider",
  render: () => {
    const [value, setValue] = React.useState<number>(sliderFixtures.effort.value);
    return (
      <NativeFrame>
        <Slider {...sliderFixtures.effort} onValueChange={setValue} value={value} />
      </NativeFrame>
    );
  },
};

export const SwitchStory: Story = {
  name: "Switch",
  render: () => {
    const [checked, setChecked] = React.useState(true);
    return (
      <NativeFrame>
        <Switch {...switchFixtures.notifications} checked={checked} onCheckedChange={setChecked} />
      </NativeFrame>
    );
  },
};

export const TabsStory: Story = {
  name: "Tabs",
  render: () => {
    const tabsFixture = tabsFixtures.settings;
    const [value, setValue] = React.useState<string>(tabsFixture.values.overview);
    return (
      <NativeFrame>
        <Tabs onValueChange={setValue} value={value}>
          <TabsList>
            <TabsTrigger value={tabsFixture.values.overview}>
              {tabsFixture.triggers.overview.label}
            </TabsTrigger>
            <TabsTrigger value={tabsFixture.values.sessions}>
              {tabsFixture.triggers.sessions.label}
            </TabsTrigger>
          </TabsList>
          <TabsContent value={tabsFixture.values.overview}>
            <Text>{tabsFixture.content.overview}</Text>
          </TabsContent>
          <TabsContent value={tabsFixture.values.sessions}>
            <Text>{tabsFixture.content.sessions}</Text>
          </TabsContent>
        </Tabs>
      </NativeFrame>
    );
  },
};

export const TextStory: Story = {
  name: "Text",
  render: () => (
    <NativeFrame>
      <Text className="text-base text-foreground">
        Shared text primitives render with semantic tokens.
      </Text>
    </NativeFrame>
  ),
};

export const TextareaStory: Story = {
  name: "Textarea",
  render: () => {
    const [value, setValue] = React.useState<string>(textareaFixtures.value);
    return (
      <NativeFrame>
        <Textarea {...textareaFixtures.notes} onChangeText={setValue} value={value} />
      </NativeFrame>
    );
  },
};

export const ToggleStory: Story = {
  name: "Toggle",
  render: () => {
    const [pressed, setPressed] = React.useState(true);
    return (
      <NativeFrame>
        <Toggle onPressedChange={setPressed} pressed={pressed} variant="outline">
          <Text>Intensity lock</Text>
        </Toggle>
      </NativeFrame>
    );
  },
};

export const ToggleGroupStory: Story = {
  name: "Toggle Group",
  render: () => {
    const [value, setValue] = React.useState<string>("grid");
    return (
      <NativeFrame>
        <ToggleGroup
          onValueChange={(nextValue) => setValue(nextValue ?? "grid")}
          type="single"
          value={value}
          variant="outline"
        >
          <ToggleGroupItem isFirst value="grid">
            <ToggleGroupIcon as={LayoutGrid} />
            <Text>Grid</Text>
          </ToggleGroupItem>
          <ToggleGroupItem isLast value="list">
            <Text>List</Text>
          </ToggleGroupItem>
        </ToggleGroup>
      </NativeFrame>
    );
  },
};

export const WeightInputFieldStory: Story = {
  name: "Weight Input Field",
  render: () => {
    const [valueKg, setValueKg] = React.useState<number | null>(
      weightInputFieldFixtures.athlete.valueKg,
    );
    const [unit, setUnit] = React.useState<"kg" | "lbs">("kg");
    return (
      <NativeFrame>
        <WeightInputField
          {...weightInputFieldFixtures.athlete}
          onChangeKg={setValueKg}
          onUnitChange={setUnit}
          unit={unit}
          valueKg={valueKg}
        />
      </NativeFrame>
    );
  },
};
