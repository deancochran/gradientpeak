Looking at your implementation, you have a solid foundation but there are several architectural improvements needed for an enterprise-level, high-performance recording system. Here's a comprehensive plan:

## Current Implementation Issues

**Performance Bottlenecks:**
- Full state sync on every change (`syncState()` updates everything)
- Converting Map to object on each render
- No granular subscriptions
- Re-rendering all consumers on any metric change

**Architectural Limitations:**
- Singleton service tightly coupled to React
- No separation between data streams and UI state
- Missing proper state management patterns for high-frequency updates
- No optimization for multi-screen synchronization

## Recommended Architecture Plan

### 1. **Event-Driven Architecture with Granular Subscriptions**

Instead of monolithic state updates, implement a pub/sub system with specific channels:

- **Metrics Stream**: High-frequency sensor data (10-60Hz)
- **State Stream**: Recording state changes (low frequency)
- **Command Stream**: User actions and system commands
- **Sync Stream**: Multi-screen coordination

Each consumer subscribes only to relevant streams, preventing unnecessary re-renders.

### 2. **Multi-Layer State Management**

**Layer 1: Core Service (Non-React)**
- Pure TypeScript service handling all business logic
- WebWorker-compatible for heavy computations
- Maintains authoritative state
- Emits granular events

**Layer 2: State Bridge**
- Reactive state stores (Zustand/Valtio recommended)
- Separate stores for different concerns:
  - `useMetricsStore`: Live sensor data with throttled updates
  - `useRecordingStore`: Session state and controls
  - `useDeviceStore`: Sensor connections
  - `usePlanStore`: Activity plans and progress

**Layer 3: React Integration**
- Thin provider for dependency injection only
- Custom hooks with memoized selectors
- React.memo components with precise dependencies

### 3. **Performance Optimization Strategy**

**Metrics Handling:**
- Buffer high-frequency updates (use `requestAnimationFrame`)
- Implement sliding window for historical samples
- Use immutable data structures (Immer)
- Separate visual updates from data recording

**Memory Management:**
- Ring buffers for historical data
- Lazy loading for large datasets
- Automatic cleanup of old samples
- WeakMap for temporary associations

### 4. **Multi-Screen Synchronization**

**Broadcast Channel API:**
- Real-time sync between browser tabs
- Shared workers for centralized processing
- Leader election for authoritative instance

**State Reconciliation:**
- Operational Transformation (OT) for conflicts
- Event sourcing for replay capability
- Optimistic UI updates with rollback

### 5. **Modular Service Architecture**

```
ActivityRecorderCore/
├── StreamManager (handles all data streams)
├── MetricsProcessor (buffers, transforms, aggregates)
├── StorageManager (IndexedDB, memory management)
├── SyncManager (multi-screen coordination)
├── PermissionManager
├── DeviceManager
└── PlanExecutor

Bridges/
├── ReactBridge (Zustand stores)
├── WorkerBridge (offload processing)
└── BroadcastBridge (tab sync)
```

### 6. **Data Flow Architecture**

**Write Path:**
```
Sensors → Buffer → Processor → Store → Subscribers
                ↓
            Storage (async)
```

**Read Path:**
```
UI Component → Selector → Store → Cached Value
                        ↓
                  Lazy Load (if needed)
```

### 7. **Implementation Priorities**

**Phase 1: Core Refactoring**
- Extract service from React context
- Implement event emitter with channels
- Create separate Zustand stores
- Add metric buffering

**Phase 2: Performance**
- Implement selective subscriptions
- Add request animation frame batching
- Create memoized selectors
- Optimize re-render patterns

**Phase 3: Advanced Features**
- Add WebWorker support
- Implement Broadcast Channel
- Create ring buffer for history
- Add state persistence

**Phase 4: Monitoring**
- Performance metrics collection
- Error boundary integration
- Telemetry for latency tracking
- Debug tools for state inspection

### 8. **Key Design Patterns to Implement**

- **Observer Pattern**: For granular subscriptions
- **Command Pattern**: For action dispatching
- **Strategy Pattern**: For different metric processors
- **Factory Pattern**: For device/sensor creation
- **Facade Pattern**: For simplified API surface

### 9. **Testing Strategy**

- Unit tests for core services
- Integration tests for state management
- Performance benchmarks for metrics
- E2E tests for multi-screen scenarios

This architecture will handle dozens of metrics at 60Hz+ while maintaining smooth UI performance and reliable multi-screen synchronization. The modular design allows for easy scaling and maintenance as requirements grow.

Looking at your provider in the context of the performance-critical requirements, here's how it should be transformed:

## Critical Issues with Current Provider

1. **Full State Synchronization**: `syncState()` updates everything on any change
2. **No Granular Subscriptions**: Every consumer re-renders on any metric update
3. **Expensive Operations**: Map-to-object conversion on every update
4. **Direct Service Coupling**: Provider is tightly bound to service internals
5. **No Performance Optimization**: Missing memoization, throttling, or selective updates

## Recommended Provider Architecture

### 1. **Split into Multiple Specialized Providers**

```typescript
// Instead of one monolithic provider, use composition:

<RecordingServiceProvider>  {/* Service injection only */}
  <RecordingStateProvider>  {/* Session state */}
    <MetricsProvider>        {/* Live metrics with RAF batching */}
      <DevicesProvider>      {/* Bluetooth connections */}
        <PlanProvider>       {/* Activity plans */}
          {children}
        </PlanProvider>
      </DevicesProvider>
    </MetricsProvider>
  </RecordingStateProvider>
</RecordingServiceProvider>
```

### 2. **Replace Context with Zustand Stores**

```typescript
// High-frequency metrics store with throttling
const useMetricsStore = create((set, get) => ({
  metrics: new Map<string, number>(),
  buffer: [],

  // Batched updates using RAF
  addMetric: (key, value) => {
    get().buffer.push({ key, value });
    if (!get().rafId) {
      const rafId = requestAnimationFrame(() => {
        set(state => ({
          metrics: new Map([...state.metrics, ...state.buffer.map(b => [b.key, b.value])]),
          buffer: [],
          rafId: null
        }));
      });
      set({ rafId });
    }
  }
}));

// Low-frequency state store
const useRecordingStore = create((set) => ({
  state: 'idle' as RecordingState,
  activityType: null,
  recording: null,

  // Actions with optimistic updates
  startRecording: async () => {
    set({ state: 'starting' });
    try {
      const recording = await recordingService.start();
      set({ state: 'recording', recording });
    } catch (error) {
      set({ state: 'error' });
    }
  }
}));
```

### 3. **Implement Selective Subscriptions**

```typescript
// Subscribe only to specific metrics
const useMetric = (metricName: string) => {
  return useMetricsStore(
    useCallback(state => state.metrics.get(metricName), [metricName])
  );
};

// Subscribe to multiple metrics with shallow comparison
const useMetrics = (metricNames: string[]) => {
  return useMetricsStore(
    useCallback(
      state => metricNames.reduce((acc, name) => {
        acc[name] = state.metrics.get(name);
        return acc;
      }, {}),
      [metricNames.join(',')]
    ),
    shallow
  );
};
```

### 4. **Service Bridge Pattern**

```typescript
class ServiceBridge {
  private service: ActivityRecorderService;
  private subscriptions = new Map<string, Set<Function>>();

  constructor(service: ActivityRecorderService) {
    this.service = service;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Listen to service events and forward to stores
    this.service.on('metric', (data) => {
      // Throttled update for metrics
      metricsStore.addMetric(data.key, data.value);
    });

    this.service.on('state', (state) => {
      // Direct update for state changes
      recordingStore.setState(state);
    });

    this.service.on('device', (device) => {
      // Debounced update for device changes
      devicesStore.updateDevice(device);
    });
  }
}
```

### 5. **Optimized Provider Implementation**

```typescript
// Minimal provider for dependency injection
export const RecordingServiceProvider: React.FC<{
  children: ReactNode;
  profileId: string;
}> = ({ children, profileId }) => {
  const serviceRef = useRef<ActivityRecorderService>();
  const bridgeRef = useRef<ServiceBridge>();

  useEffect(() => {
    // Initialize service and bridge
    if (!serviceRef.current) {
      serviceRef.current = new ActivityRecorderService(profileId);
      bridgeRef.current = new ServiceBridge(serviceRef.current);

      // Initialize stores with service reference
      useRecordingStore.setState({ service: serviceRef.current });
      useMetricsStore.setState({ service: serviceRef.current });
    }

    return () => {
      bridgeRef.current?.cleanup();
      serviceRef.current?.cleanup();
    };
  }, [profileId]);

  // No context needed - stores handle everything
  return <>{children}</>;
};
```

### 6. **Optimized Hooks**

```typescript
// Performance-optimized hooks
export const useRecordingState = () => {
  return useRecordingStore(state => state.state);
};

export const useLiveHeartRate = () => {
  return useMetricsStore(state => state.metrics.get('heartrate'));
};

export const usePowerZone = () => {
  const power = useMetricsStore(state => state.metrics.get('power'));
  const ftp = useProfileStore(state => state.ftp);
  return useMemo(() => calculatePowerZone(power, ftp), [power, ftp]);
};

// Composite hook with memoization
export const useActivityRecorder = () => {
  const recordingState = useRecordingStore();
  const startRecording = useRecordingStore(state => state.startRecording);
  const pauseRecording = useRecordingStore(state => state.pauseRecording);

  return useMemo(() => ({
    state: recordingState.state,
    startRecording,
    pauseRecording,
    // ... other actions
  }), [recordingState.state, startRecording, pauseRecording]);
};
```

### 7. **Multi-Screen Synchronization**

```typescript
// Broadcast channel for tab sync
const channel = new BroadcastChannel('activity-recorder');

const useSyncedMetrics = () => {
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data.type === 'metrics') {
        useMetricsStore.getState().syncMetrics(event.data.metrics);
      }
    };

    channel.addEventListener('message', handleMessage);
    return () => channel.removeEventListener('message', handleMessage);
  }, []);

  return useMetricsStore(state => state.metrics);
};
```

### 8. **Performance Monitoring**

```typescript
// Add performance tracking
const useMetricsWithTelemetry = () => {
  const metrics = useMetricsStore(state => state.metrics);

  useEffect(() => {
    performance.mark('metrics-render');

    return () => {
      performance.measure('metrics-update', 'metrics-render');
      const measure = performance.getEntriesByName('metrics-update')[0];

      if (measure.duration > 16) { // Longer than one frame
        console.warn('Slow metrics update:', measure.duration);
      }
    };
  });

  return metrics;
};
```

## Migration Strategy

1. **Phase 1**: Add Zustand stores alongside existing context
2. **Phase 2**: Migrate components to use stores instead of context
3. **Phase 3**: Replace service subscription with event-based bridge
4. **Phase 4**: Remove old context provider
5. **Phase 5**: Add performance optimizations (RAF, throttling, etc.)

This architecture will handle dozens of metrics at high frequency while maintaining 60fps UI performance and enabling efficient multi-screen synchronization.
